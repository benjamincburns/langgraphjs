import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { CheckpointSaverTestInitializer } from "../../types.js";

/**
 * Kicks off a set of test scenarios to validate that the provided checkpoint saver conforms to the specification for classes that extend @see BaseCheckpointSaver.
 * @param name The name of the saver implementation being tested
 * @param initializer A @see CheckpointSaverTestInitializer, providing methods for setup and cleanup of the test, and for creation of the saver instance being tested.
 */
export function scenarioTest<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  console.log(`${name}#scenarioTest, has initializer: ${!!initializer}`);
}
