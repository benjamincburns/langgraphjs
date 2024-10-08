import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { specTest } from "./spec/index.js";
import { scenarioTest } from "./scenario/index.js";

const initializer = {
  createSaver: () => new MemorySaver(),
};

scenarioTest("MemorySaver", initializer);
specTest("MemorySaver", initializer);
