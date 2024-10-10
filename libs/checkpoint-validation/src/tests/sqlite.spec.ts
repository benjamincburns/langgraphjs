// eslint-disable-next-line import/no-extraneous-dependencies
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

import type { CheckpointSaverTestInitializer } from "../types.js";
import { specTest } from "./spec/index.js";

const initializer: CheckpointSaverTestInitializer<SqliteSaver> = {
  async createSaver() {
    return SqliteSaver.fromConnString(":memory:");
  },

  destroySaver(saver) {
    saver.db.close();
  },
};

// scenarioTest("@langchain/langgraph-checkpoint-sqlite", initializer);
specTest("@langchain/langgraph-checkpoint-sqlite", initializer);
