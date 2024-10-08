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
import { skipOnModules } from "../utils.js";

export function putTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#put`, () => {
    let saver: T;
    let initializerConfig: RunnableConfig;
    let thread_id: string;
    let checkpoint_id: string;

    beforeEach(async () => {
      thread_id = uuid6(-3);
      checkpoint_id = uuid6(-3);

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
            mergeConfigs(configArgument, {
              configurable: {
                // add an field to the config at put time to ensure that the saver persists config as a (mostly) opaque object
                canary: "tweet",
              },
            }),

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
            expect.objectContaining(
              // allow the saver to add additional fields to the config
              mergeConfigs(configArgument, { configurable: { checkpoint_id } })
            )
          );
        });

        // TODO: this check fails for MemorySaver, is this an actual requirement of CheckpointSavers, or am I misunderstanding?
        skipOnModules(
          name,
          {
            moduleName: "MemorySaver",
            skipReason:
              "MemorySaver rebuilds configs in `getTuple` rather than storing them",
          },
          {
            moduleName: "@langchain/langgraph-checkpoint-mongodb",
            skipReason:
              "MongoDBSaver does not store configs, only the checkpoint and metadata",
          }
        )("should retain additional fields in the config", () => {
          expect(savedCheckpointTuple?.config).toEqual(
            expect.objectContaining(
              mergeConfigs(configArgument, {
                configurable: { checkpoint_id, canary: "tweet" },
              })
            )
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
                checkpoint,
                metadata!,
                {} /* not sure what to do about newVersions, as it's unused */
              )
          ).rejects.toThrow();
        });
      });
    });

    skipOnModules(name, {
      moduleName: "@langchain/langgraph-checkpoint-mongodb",
      skipReason:
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
          checkpoint_id,
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
