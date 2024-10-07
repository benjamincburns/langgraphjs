import {
  Checkpoint,
  CheckpointMetadata,
  uuid6,
  type BaseCheckpointSaver,
} from "@langchain/langgraph-checkpoint";
import {
  describe,
  it,
  beforeEach,
  afterEach,
  expect,
} from "@jest/globals";
import { mergeConfigs, RunnableConfig } from "@langchain/core/runnables";
import { CheckpointSaverTestInitializer } from "../../types.js";
import { emptyInitialCheckpointTuple } from "./data.js";

export function putWritesTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#putWrites`, () => {
    let saver!: T;
    let config!: RunnableConfig;
    let thread_id!: string;
    let checkpoint_id!: string;
    let metadata!: CheckpointMetadata;
    let checkpoint!: Checkpoint;

    beforeEach(async () => {
      thread_id = uuid6(-3);
      checkpoint_id = uuid6(-3);

      const baseConfig = {
        configurable: {
          thread_id,
        },
      };

      const initializerConfig = await initializer.configure?.(config);

      config = mergeConfigs(baseConfig, initializerConfig);
      saver = await initializer.createSaver(config);
      
      const checkpointTuple = emptyInitialCheckpointTuple(checkpoint_id, "root", config);
      checkpoint = checkpointTuple.checkpoint;
      metadata = checkpointTuple.metadata!;
    });

    afterEach(async () => {
      await initializer.destroySaver?.(saver, config);
    });

    describe.each(["root", "child"])("namespace: %s", (namespace) => {
      const checkpoint_ns = namespace === "root" ? '' : namespace;
    
      beforeEach(async () => {
        config = mergeConfigs(config, {
          configurable: { checkpoint_ns },
        });

        // ensure the test checkpoint does not already exist
        const existingCheckpoint = await saver.get(config);
        expect(existingCheckpoint).toBeUndefined(); // our test checkpoint should not exist yet
        
        config = mergeConfigs(config, await saver.put(config, checkpoint, metadata, {}));
      });
      
      it("should store writes to the checkpoint", async () => {
        await saver.putWrites(config, [["animals", "dog"]], "pet_task");
        const checkpointTuple = await saver.getTuple(config);
        expect(checkpointTuple).not.toBeUndefined();
        expect(checkpointTuple?.checkpoint).toEqual(checkpoint);
        expect(checkpointTuple?.metadata).toEqual(metadata);
        expect(checkpointTuple?.config).toEqual(config);
        expect(checkpointTuple?.pendingWrites).toEqual([["pet_task", "animals", "dog"]]);
        expect(checkpointTuple?.parentConfig).toBeUndefined();
      });

      it("should fail if the thread_id is missing", async () => {
        const missingThreadIdConfig: RunnableConfig = mergeConfigs(config, {});
        delete missingThreadIdConfig.configurable?.thread_id;

        await expect(
          async () =>
            await saver.putWrites(
              missingThreadIdConfig, [["animals", "dog"]], "pet_task"
            )
        ).rejects.toThrow();
      });

      it("should fail if the checkpoint_id is missing", async () => {
        const missingCheckpointIdConfig: RunnableConfig = mergeConfigs(config, {});
        delete missingCheckpointIdConfig.configurable?.checkpoint_id;

        await expect(
          async () =>
            await saver.putWrites(
              missingCheckpointIdConfig, [["animals", "dog"]], "pet_task"
            )
        ).rejects.toThrow();
      });
    });
  });
}
