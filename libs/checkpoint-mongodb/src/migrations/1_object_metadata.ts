import { MongoClient, Binary, ObjectId, Collection, Document } from "mongodb";
import {
  CheckpointMetadata,
  SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import { Migration, MigrationError } from "./base.js";

import { z } from "zod";

const BULK_WRITE_SIZE = 100;

export class Migration1ObjectMetadata extends Migration {
  version = 1;

  private oldCheckpointSchema = z.object({
    parent_checkpoint_id: z.string().optional(),
    type: z.string(),
    checkpoint: z.custom<Binary>(),
    metadata: z.custom<Binary>(),
    thread_id: z.string(),
    checkpoint_ns: z.string().optional(),
    checkpoint_id: z.string(),
  });

  private newCheckpointSchema = z.object({
    parent_checkpoint_id: z.string().optional(),
    type: z.string(),
    checkpoint: z.custom<Binary>(),
    metadata: z.object({
      source: z.enum(["input", "loop", "update"]),
      step: z.number(),
      writes: z.union([z.record(z.string(), z.unknown()), z.null()]),
      parents: z.record(z.string(), z.string()),
    }),
    thread_id: z.string(),
    checkpoint_ns: z.string().optional(),
    checkpoint_id: z.string(),
  });
  constructor(
    client: MongoClient,
    dbName: string,
    checkpointCollectionName: string,
    checkpointWritesCollectionName: string,
    schemaVersionCollectionName: string,
    serializer: SerializerProtocol
  ) {
    super(
      client,
      dbName,
      checkpointCollectionName,
      checkpointWritesCollectionName,
      schemaVersionCollectionName,
      serializer
    );
  }

  async apply() {
    const db = this.client.db(this.dbName);
    const checkpointCollection = db.collection(this.checkpointCollectionName);
    const schemaVersionCollection = db.collection(
      this.schemaVersionCollectionName
    );

    // Fetch all documents from the checkpoints collection
    const cursor = checkpointCollection.find({});

    let updateBatch: {
      id: string;
      newCheckpoint: z.infer<
        typeof Migration1ObjectMetadata.prototype.newCheckpointSchema
      >;
    }[] = [];

    let itemCount = 0;

    for await (const doc of cursor) {
      const newDocParseResult = this.newCheckpointSchema.safeParse(doc);
      if (newDocParseResult.success) {
        continue;
      }

      const oldDocParseResult = this.oldCheckpointSchema.safeParse(doc);
      if (!oldDocParseResult.success) {
        throw new MigrationError(
          `Error parsing checkpoint: ${oldDocParseResult.error}`
        );
      }

      const oldCheckpoint = oldDocParseResult.data;

      const metadataObj: CheckpointMetadata = await this.serializer.loadsTyped(
        oldCheckpoint.type,
        oldCheckpoint.metadata.value()
      );

      const newCheckpoint = {
        ...oldCheckpoint,
        metadata: metadataObj,
      };

      updateBatch.push({
        id: doc._id.toString(),
        newCheckpoint,
      });

      if (updateBatch.length >= BULK_WRITE_SIZE) {
        await this.flushBatch(updateBatch, checkpointCollection);
        updateBatch = [];
      }
      itemCount++;
    }

    if (updateBatch.length > 0) {
      await this.flushBatch(updateBatch, checkpointCollection);
    }

    // Update schema version to 1
    await schemaVersionCollection.updateOne(
      {},
      { $set: { version: 1 } },
      { upsert: true }
    );

    console.log(
      `Migration completed successfully. Schema version updated to 1. Processed ${itemCount} items.`
    );
  }

  private async flushBatch(
    updateBatch: {
      id: string;
      newCheckpoint: z.infer<
        typeof Migration1ObjectMetadata.prototype.newCheckpointSchema
      >;
    }[],
    checkpointCollection: Collection<Document>
  ) {
    if (updateBatch.length === 0) {
      throw new Error("No updates to apply");
    }

    const bulkOps = updateBatch.map(({ id, newCheckpoint }) => ({
      updateOne: {
        filter: { _id: new ObjectId(id) },
        update: { $set: newCheckpoint },
      },
    }));

    await checkpointCollection.bulkWrite(bulkOps);
  }
}
