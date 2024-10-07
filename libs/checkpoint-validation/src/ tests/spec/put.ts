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

export function putTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#put`, () => {
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
      });

      it("should store an empty checkpoint in the default namespace with its configuration and empty metadata", async () => {
        const newConfig = await saver.put(
          config,
          checkpoint,
          metadata,
          {} /* not sure what to do about newVersions, as it's unused */
        );

        expect(newConfig.configurable).toBeDefined(); // put must return a config with a "configurable" property.

        expect(newConfig.configurable?.thread_id).toEqual(thread_id); // the thread_id must be preserved in the returned config

        expect(newConfig.configurable?.checkpoint_id).toEqual(checkpoint.id); // the checkpoint_id must be preserved in the returned config

        expect(newConfig.configurable?.checkpoint_ns).toEqual(checkpoint_ns); // the checkpoint_ns must be preserved in the returned config

        const savedCheckpointTuple = await saver.getTuple(newConfig);
        expect(savedCheckpointTuple).not.toBeUndefined();
        expect(savedCheckpointTuple?.checkpoint).toEqual(checkpoint);
        expect(savedCheckpointTuple?.metadata).toEqual(metadata);
        expect(savedCheckpointTuple?.config).toEqual(newConfig);
      });

      it("should fail if the thread_id is missing", async () => {
        const missingThreadIdConfig: RunnableConfig = mergeConfigs(config, {});
        delete missingThreadIdConfig.configurable?.thread_id;

        await expect(
          async () =>
            await saver.put(
              missingThreadIdConfig,
              checkpoint,
              metadata,
              {} /* not sure what to do about newVersions, as it's unused */
            )
        ).rejects.toThrow();
      });
    });

    it("should fail if the checkpoint namespace is missing", async () => {
      const missingNamespaceConfig: RunnableConfig = mergeConfigs(config, {});
      delete missingNamespaceConfig.configurable?.checkpoint_ns;

      await expect(
        async () =>
          await saver.put(
            missingNamespaceConfig,
            checkpoint,
            metadata,
            {} /* not sure what to do about newVersions, as it's unused */
          )
      ).rejects.toThrow();
    });
  });
}
