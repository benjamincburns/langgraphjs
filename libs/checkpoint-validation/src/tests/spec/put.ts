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
import { it_skipForSomeModules } from "../utils.js";

export function putTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#put`, () => {
    let saver: T;
    let initializerConfig: RunnableConfig;
    let thread_id: string;
    let checkpoint_id1: string;
    let checkpoint_id2: string;
    let invalid_checkpoint_id: string;

    beforeEach(async () => {
      thread_id = uuid6(-3);
      checkpoint_id1 = uuid6(-3);
      checkpoint_id2 = uuid6(-3);
      invalid_checkpoint_id = uuid6(-3);

      const baseConfig = {
        configurable: {
          thread_id,
        },
      };

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
      let checkpointStoredWithoutIdInConfig: Checkpoint;
      let metadataStoredWithoutIdInConfig: CheckpointMetadata | undefined;
      let checkpointStoredWithIdInConfig: Checkpoint;
      let metadataStoredWithIdInConfig: CheckpointMetadata | undefined;

      describe("success cases", () => {
        let returnedConfig1: RunnableConfig;
        let returnedConfig2: RunnableConfig;
        let savedCheckpointTuple1: CheckpointTuple | undefined;
        let savedCheckpointTuple2: CheckpointTuple | undefined;

        beforeEach(async () => {
          ({
            checkpoint: checkpointStoredWithoutIdInConfig,
            metadata: metadataStoredWithoutIdInConfig,
          } = emptyInitialCheckpointTuple(
            checkpoint_id1,
            checkpoint_ns,
            initializerConfig
          ));

          ({
            checkpoint: checkpointStoredWithIdInConfig,
            metadata: metadataStoredWithIdInConfig,
          } = emptyInitialCheckpointTuple(
            checkpoint_id2,
            checkpoint_ns,
            initializerConfig
          ));

          configArgument = mergeConfigs(initializerConfig, {
            configurable: { checkpoint_ns },
          });

          // validate assumptions - the test checkpoints must not already exist
          const existingCheckpoint1 = await saver.get(
            mergeConfigs(configArgument, {
              configurable: {
                checkpoint_id: checkpoint_id1,
              },
            })
          );

          const existingCheckpoint2 = await saver.get(
            mergeConfigs(configArgument, {
              configurable: {
                checkpoint_id: checkpoint_id1,
              },
            })
          );

          expect(existingCheckpoint1).toBeUndefined();
          expect(existingCheckpoint2).toBeUndefined();

          // set up
          // call put without the `checkpoint_id` in the config
          returnedConfig1 = await saver.put(
            mergeConfigs(configArgument, {
              // Add an field to the config at put time to see whether or not the saver persists it. Note that we don't
              // add this into `configArgument` directly because we don't want to pass it to `getTuple` when we fetch
              // the checkpoint to validate what was stored. If we were to pass it to `getTuple` and the field was
              // present in the stored tuple's config, we wouldn't know whether the field was there because it was
              // persisted during the call to `put`, or because it was added to the config on the `put` call.
              configurable: {
                canary: "tweet",
              },
            }),

            checkpointStoredWithoutIdInConfig,
            metadataStoredWithoutIdInConfig!,
            {} /* not sure what to do about newVersions, as it's apparently unused */
          );

          // call put with a different `checkpoint_id` in the config to ensure that it treats the `id` field in the `Checkpoint` as
          // the authoritative identifier, rather than the `checkpoint_id` in the config
          returnedConfig2 = await saver.put(
            mergeConfigs(configArgument, {
              configurable: {
                checkpoint_id: invalid_checkpoint_id,
              },
            }),
            checkpointStoredWithIdInConfig,
            metadataStoredWithIdInConfig!,
            {}
          );

          savedCheckpointTuple1 = await saver.getTuple(
            mergeConfigs(configArgument, returnedConfig1)
          );

          savedCheckpointTuple2 = await saver.getTuple(
            mergeConfigs(configArgument, returnedConfig2)
          );
        });

        it("should return a config with a 'configurable' property", () => {
          expect(returnedConfig1.configurable).toBeDefined();
        });

        it("should return config with matching thread_id", () => {
          expect(returnedConfig1.configurable?.thread_id).toEqual(thread_id);
        });

        it("should return config with matching checkpoint_id", () => {
          expect(returnedConfig1.configurable?.checkpoint_id).toEqual(
            checkpointStoredWithoutIdInConfig.id
          );
          expect(returnedConfig2.configurable?.checkpoint_id).toEqual(
            checkpointStoredWithIdInConfig.id
          );
        });
        
        it("should return a checkpoint with a new id when the id in the config on put is invalid", () => {
          expect(savedCheckpointTuple2?.checkpoint.id).not.toEqual(invalid_checkpoint_id);
        });

        it("should return config with matching checkpoint_ns", () => {
          expect(returnedConfig1.configurable?.checkpoint_ns).toEqual(
            checkpoint_ns
          );
        });

        it("should result in a retrievable checkpoint tuple", () => {
          expect(savedCheckpointTuple1).not.toBeUndefined();
        });

        it("should store the checkpoint without alteration", () => {
          expect(savedCheckpointTuple1?.checkpoint).toEqual(
            checkpointStoredWithoutIdInConfig
          );
        });

        it("should store the metadata without alteration", () => {
          expect(savedCheckpointTuple1?.metadata).toEqual(
            metadataStoredWithoutIdInConfig
          );
        });
      });

      describe("failure cases", () => {
        it("should fail if the thread_id is missing", async () => {
          const missingThreadIdConfig: RunnableConfig = {
            ...configArgument,
            configurable: Object.fromEntries(
              Object.entries(configArgument.configurable ?? {}).filter(
                ([key]) => key !== "thread_id"
              )
            ),
          };

          await expect(
            async () =>
              await saver.put(
                missingThreadIdConfig,
                checkpointStoredWithoutIdInConfig,
                metadataStoredWithoutIdInConfig!,
                {} /* not sure what to do about newVersions, as it's unused */
              )
          ).rejects.toThrow();
        });
      });
    });

    it_skipForSomeModules(name, {
      "@langchain/langgraph-checkpoint-mongodb":
        "MongoDBSaver defaults to empty namespace when namespace is undefined",
    })(
      "should throw if the checkpoint namespace is missing from config.configurable",
      async () => {
        const missingNamespaceConfig: RunnableConfig = {
          ...initializerConfig,
          configurable: Object.fromEntries(
            Object.entries(initializerConfig.configurable ?? {}).filter(
              ([key]) => key !== "checkpoint_ns"
            )
          ),
        };

        const { checkpoint, metadata } = emptyInitialCheckpointTuple(
          checkpoint_id1,
          "",
          missingNamespaceConfig
        );

        await expect(
          async () =>
            await saver.put(
              missingNamespaceConfig,
              checkpoint,
              metadata!,
              {} /* not sure what to do about newVersions, as it's unused */
            )
        ).rejects.toThrow(); // no standard error type or message is thrown, so we just check that it throws
      }
    );
  });
}
