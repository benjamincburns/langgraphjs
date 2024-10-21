import { SerializerProtocol } from "@langchain/langgraph-checkpoint";
import { Db, MongoClient } from "mongodb";
import { z } from "zod";

export abstract class Migration {
  abstract version: number;
  protected client: MongoClient;
  protected dbName: string;
  protected checkpointCollectionName: string;
  protected checkpointWritesCollectionName: string;
  protected schemaVersionCollectionName: string;
  protected serializer: SerializerProtocol;
  private db: Db;
  private schemaVersionDocSchema = z.object({
    version: z.number(),
  });

  constructor(
    client: MongoClient,
    dbName: string,
    checkpointCollectionName: string,
    checkpointWritesCollectionName: string,
    schemaVersionCollectionName: string,
    serializer: SerializerProtocol
  ) {
    this.client = client;
    this.dbName = dbName;
    this.checkpointCollectionName = checkpointCollectionName;
    this.checkpointWritesCollectionName = checkpointWritesCollectionName;
    this.schemaVersionCollectionName = schemaVersionCollectionName;
    this.serializer = serializer;
    this.db = this.client.db(this.dbName);
  }

  abstract apply(): Promise<void>;

  async isApplicable(): Promise<boolean> {
    const schemaVersionCollectionExists = await this.db
      .listCollections({ name: this.schemaVersionCollectionName })
      .hasNext();

    const checkpointCollectionExists = await this.db
      .listCollections({ name: this.checkpointCollectionName })
      .hasNext();

    const checkpointWritesCollectionExists = await this.db
      .listCollections({ name: this.checkpointWritesCollectionName })
      .hasNext();

    // uninitialized database - nothing to migrate
    if (
      !checkpointCollectionExists &&
      !checkpointWritesCollectionExists &&
      !schemaVersionCollectionExists
    ) {
      return false;
    }

    if (this.version === 1) {
      // existing database with no schema version - created before migrations were introduced
      // don't care if checkpoint writes collection exists or not, may not have been created yet
      if (checkpointCollectionExists && !schemaVersionCollectionExists) {
        return true;
      }
    }

    if (!schemaVersionCollectionExists) {
      throw new Error(
        "Database is not in a valid state. No schema version found. Manual migration required."
      );
    }

    const versionDoc = await this.db
      .collection(this.schemaVersionCollectionName)
      .findOne({});

    if (!versionDoc) {
      throw new Error(
        "Database is not in a valid state. No schema version found. Manual migration required."
      );
    }

    const version = this.schemaVersionDocSchema.parse(versionDoc).version;

    if (version < this.version) {
      return true;
    }

    return false;
  }
}

export class MigrationError extends Error {}
