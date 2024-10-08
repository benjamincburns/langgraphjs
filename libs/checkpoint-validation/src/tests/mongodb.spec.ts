// eslint-disable-next-line import/no-extraneous-dependencies
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from "@testcontainers/mongodb";

// eslint-disable-next-line import/no-extraneous-dependencies
import { MongoClient } from "mongodb";
import type { CheckpointSaverTestInitializer } from "../types.js";
import { specTest } from "./spec/index.js";

const dbName = "test_db";

const container = new MongoDBContainer("mongo:6.0.1");

let startedContainer: StartedMongoDBContainer;
let client: MongoClient | undefined;

const initializer: CheckpointSaverTestInitializer<MongoDBSaver> = {
  beforeAll: async () => {
    startedContainer = await container.start();
    const connectionString = `mongodb://127.0.0.1:${startedContainer.getMappedPort(
      27017
    )}/${dbName}?directConnection=true`;
    client = new MongoClient(connectionString);
  },

  beforeAllTimeout: 300_000, // five minutes, to pull docker container

  createSaver: () =>
    new MongoDBSaver({
      client: client!,
    }),

  afterAll: async () => {
    await client?.close();
    await startedContainer.stop();
  },
};

// scenarioTest("MemorySaver", initializer);
specTest("@langchain/langgraph-checkpoint-mongodb", initializer);
