import {
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  uuid6,
  type BaseCheckpointSaver,
} from "@langchain/langgraph-checkpoint";
import { describe, it, afterEach, beforeEach, expect } from "@jest/globals";
import { mergeConfigs, RunnableConfig } from "@langchain/core/runnables";
import { CheckpointSaverTestInitializer } from "../../types.js";
import { emptyInitialCheckpointTuple } from "./data.js";

export function putTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#put`, () => {
    let saver!: T;
    let initializerConfig!: RunnableConfig;
    const thread_id = uuid6(-3);
    const checkpoint_id = uuid6(-3);

      const baseConfig = {
        configurable: {
          thread_id,

          // this is here to make sure that the saver stores the whole config object, and not just the keys it knows about
          some_random_key: "some_random_value",
        },
      };


    beforeEach(async () => {
      initializerConfig = mergeConfigs(
        baseConfig,
        await initializer.configure?.(baseConfig)
      );
      saver = await initializer.createSaver(initializerConfig);
    });

    afterEach(async () => {
      await initializer.destroySaver?.(saver, initializerConfig);
    });

    describe.each(["root", "child"])("namespace: %s", (namespace) => {
      const checkpoint_ns = namespace === "root" ? "" : namespace;
      let configArgument: RunnableConfig;
      let checkpoint: Checkpoint;
      let metadata: CheckpointMetadata | undefined;


      describe("success cases", () => {
        let returnedConfig!: RunnableConfig;
        let savedCheckpointTuple: CheckpointTuple | undefined;

        beforeEach(async () => {
          ({ checkpoint, metadata } = emptyInitialCheckpointTuple(
            checkpoint_id,
            checkpoint_ns,
            initializerConfig
          ));

          configArgument = mergeConfigs(initializerConfig, {
            configurable: { checkpoint_ns },
          });

          // ensure the test checkpoint does not already exist
          const existingCheckpoint = await saver.get(
            mergeConfigs(configArgument, {
              configurable: {
                checkpoint_id,
              },
            })
          );
          expect(existingCheckpoint).toBeUndefined(); // our test checkpoint should not exist yet

          returnedConfig = await saver.put(
            configArgument,
            checkpoint,
            metadata!,
            {} /* not sure what to do about newVersions, as it's unused */
          );

          savedCheckpointTuple = await saver.getTuple(
            mergeConfigs(configArgument, returnedConfig)
          );

        });

        it("should return a config with a 'configurable' property", () => {
          expect(returnedConfig.configurable).toBeDefined();
        });

        it("should return config with matching thread_id", () => {
          expect(returnedConfig.configurable?.thread_id).toEqual(thread_id);
        });

        it("should return config with matching checkpoint_id", () => {
          expect(returnedConfig.configurable?.checkpoint_id).toEqual(
            checkpoint.id
          );
        });

        it("should return config with matching checkpoint_ns", () => {
          expect(returnedConfig.configurable?.checkpoint_ns).toEqual(
            checkpoint_ns
          );
        });

        it("should result in a retrievable checkpoint tuple", () => {
          expect(savedCheckpointTuple).not.toBeUndefined();
        });

        it("should store the checkpoint without alteration", () => {
          expect(savedCheckpointTuple?.checkpoint).toEqual(checkpoint);
        });

        it("should store the metadata without alteration", () => {
          expect(savedCheckpointTuple?.metadata).toEqual(metadata);
        });

        it("should store the config argument with an additional `checkpoint_id` property (extra fields allowed)", () => {
          expect(savedCheckpointTuple?.config).toEqual(
            expect.objectContaining( // allow the saver to add additional fields to the config
              mergeConfigs(configArgument, { configurable: { checkpoint_id } })
            )
          );
        });
      });

      describe("failure cases", () => {
        it("should fail if the thread_id is missing", async () => {
          const missingThreadIdConfig: RunnableConfig = mergeConfigs(
            configArgument,
            {}
          );
          delete missingThreadIdConfig.configurable?.thread_id;

          await expect(
            async () =>
              await saver.put(
                missingThreadIdConfig,
                checkpoint,
                metadata!,
                {} /* not sure what to do about newVersions, as it's unused */
              )
          ).rejects.toThrow();
        });
      });
    });

    it("should throw if the checkpoint namespace is missing from config.configurable", async () => {
      const missingNamespaceConfig: RunnableConfig = mergeConfigs(
        initializerConfig,
        {}
      );
      delete missingNamespaceConfig.configurable?.checkpoint_ns;

      const { checkpoint, metadata } = emptyInitialCheckpointTuple(checkpoint_id, "", missingNamespaceConfig);

      await expect(
        async () =>
          await saver.put(
            missingNamespaceConfig,
            checkpoint,
            metadata!,
            {} /* not sure what to do about newVersions, as it's unused */
          )
      ).rejects.toThrow(); // no standard error type or message is thrown, so we just check that it throws
    });
  });
}
