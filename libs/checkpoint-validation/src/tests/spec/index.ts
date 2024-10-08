import { type BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { describe, beforeAll, afterAll } from "@jest/globals";

import { CheckpointSaverTestInitializer } from "../../types.js";
import { putTests } from "./put.js";
import { putWritesTests } from "./putWrites.js";
import { getTupleTests } from "./getTuple.js";

/**
 * Kicks off a test suite to validate that the provided checkpoint saver conforms to the specification for classes that extend @see BaseCheckpointSaver.
 * @param name The name of the saver implementation being tested
 * @param initializer A @see CheckpointSaverTestInitializer, providing methods for setup and cleanup of the test, and for creation of the saver instance being tested.
 */
export function specTest<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  beforeAll(async () => {
    await initializer.beforeAll?.();
  });

  afterAll(async () => {
    await initializer.afterAll?.();
  });

  describe(name, () => {
    putTests(name, initializer);
    putWritesTests(name, initializer);
    getTupleTests(name, initializer);
  });
}
