import { MongoClient } from "mongodb";
import { Migration1ObjectMetadata } from "./1_object_metadata.js";
import { SerializerProtocol } from "@langchain/langgraph-checkpoint";

function _getMigrations(
  client: MongoClient,
  dbName: string,
  checkpointCollectionName: string,
  checkpointWritesCollectionName: string,
  schemaVersionCollectionName: string,
  serializer: SerializerProtocol
) {
  const migrations = [Migration1ObjectMetadata];
  return migrations.map(
    (MigrationClass) =>
      new MigrationClass(
        client,
        dbName,
        checkpointCollectionName,
        checkpointWritesCollectionName,
        schemaVersionCollectionName,
        serializer
      )
  );
}

export async function needsMigration(
  client: MongoClient,
  dbName: string,
  checkpointCollectionName: string,
  checkpointWritesCollectionName: string,
  schemaVersionCollectionName: string,
  serializer: SerializerProtocol
) {
  const migrations = _getMigrations(
    client,
    dbName,
    checkpointCollectionName,
    checkpointWritesCollectionName,
    schemaVersionCollectionName,
    serializer
  );
  return migrations.some((migration) => migration.isApplicable());
}

export async function applyMigrations(
  client: MongoClient,
  dbName: string,
  checkpointCollectionName: string,
  checkpointWritesCollectionName: string,
  schemaVersionCollectionName: string,
  serializer: SerializerProtocol
) {
  const migrations = _getMigrations(
    client,
    dbName,
    checkpointCollectionName,
    checkpointWritesCollectionName,
    schemaVersionCollectionName,
    serializer
  );
  for (const migration of migrations) {
    if (await migration.isApplicable()) {
      await migration.apply();
    }
  }
}
