import {
  CheckpointTuple,
  TASKS,
  uuid6,
  type BaseCheckpointSaver,
} from "@langchain/langgraph-checkpoint";
import { describe, it, beforeAll, afterAll, expect } from "@jest/globals";
import { mergeConfigs, RunnableConfig } from "@langchain/core/runnables";
import { CheckpointSaverTestInitializer } from "../../types.js";
import { parentAndChildCheckpointTuplesWithWrites } from "./data.js";

export function getTupleTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#getTuple`, () => {
    let saver: T;
    let initializerConfig: RunnableConfig;
    beforeAll(async () => {
      const baseConfig = {
        configurable: {},
      };
      initializerConfig = mergeConfigs(
        baseConfig,
        await initializer.configure?.(baseConfig)
      );
      saver = await initializer.createSaver(initializerConfig);
    });

    afterAll(async () => {
      await initializer.destroySaver?.(saver, initializerConfig);
    });

    describe.each(["root", "child"])("namespace: %s", (namespace) => {
      let thread_id: string;
      const checkpoint_ns = namespace === "root" ? "" : namespace;

      let parentCheckpointId: string;
      let childCheckpointId: string;

      let generatedParentTuple: CheckpointTuple;
      let generatedChildTuple: CheckpointTuple;

      let parentTuple: CheckpointTuple | undefined;
      let childTuple: CheckpointTuple | undefined;
      let latestTuple: CheckpointTuple | undefined;

      beforeAll(async () => {
        thread_id = uuid6(-3);
        parentCheckpointId = uuid6(-3);
        childCheckpointId = uuid6(-3);

        initializerConfig.configurable!.thread_id = thread_id;

        ({ parent: generatedParentTuple, child: generatedChildTuple } =
          parentAndChildCheckpointTuplesWithWrites(
            parentCheckpointId,
            childCheckpointId,
            checkpoint_ns,
            initializerConfig
          ));

        const existingParentCheckpoint = await saver.get(
          generatedParentTuple.config
        );
        expect(existingParentCheckpoint).toBeUndefined();

        const existingChildCheckpoint = await saver.get(
          generatedChildTuple.config
        );
        expect(existingChildCheckpoint).toBeUndefined();

        // Remove checkpoint_id from parentPutConfig to emulate how the first put of a new thread typically works
        const parentPutConfig = {
          ...generatedParentTuple.config,
          configurable: Object.fromEntries(
            Object.entries(
              generatedParentTuple.config.configurable ?? {}
            ).filter(([key]) => key !== "checkpoint_id")
          ),
        };

        await saver.put(
          parentPutConfig,
          generatedParentTuple.checkpoint,
          generatedParentTuple.metadata!,
          {}
        );

        await saver.putWrites(
          generatedParentTuple.config,
          [[TASKS, ["add_fish"]]],
          "pending_sends_task"
        );

        await saver.put(
          // parent config here because that's what would be returned by the previous `put`
          generatedParentTuple.config,
          generatedChildTuple.checkpoint,
          generatedChildTuple.metadata!,
          {}
        );

        await saver.putWrites(
          generatedChildTuple.config,
          [["animals", ["fish"]]],
          "add_fish"
        );

        parentTuple = await saver.getTuple(generatedParentTuple.config);
        childTuple = await saver.getTuple(generatedChildTuple.config);
        latestTuple = await saver.getTuple(
          mergeConfigs(initializerConfig, { configurable: { checkpoint_ns } })
        );
      });

      describe("success cases", () => {
        describe("when checkpoint_id is provided", () => {
          describe("first checkpoint", () => {
            it("should return a tuple containing the checkpoint without modification", () => {
              expect(parentTuple).not.toBeUndefined();
              expect(parentTuple?.checkpoint).toEqual(
                generatedParentTuple.checkpoint
              );
            });

            it("should return a tuple containing the checkpoint's metadata without modification", () => {
              expect(parentTuple?.metadata).not.toBeUndefined();
              expect(parentTuple?.metadata).toEqual(
                generatedParentTuple.metadata
              );
            });

            it("should return a tuple containing a config object that has the correct thread_id, checkpoint_ns, and checkpoint_id", () => {
              expect(parentTuple?.config).not.toBeUndefined();

              expect(parentTuple?.config).toEqual(
                expect.objectContaining({
                  configurable: {
                    thread_id,
                    checkpoint_ns,
                    checkpoint_id: parentCheckpointId,
                  },
                })
              );
            });

            it("should return a tuple containing an undefined parentConfig", () => {
              expect(parentTuple?.parentConfig).toBeUndefined();
            });

            it("should return a tuple containing the writes against the checkpoint", () => {
              expect(parentTuple?.pendingWrites).toEqual([
                ["pending_sends_task", TASKS, ["add_fish"]],
              ]);
            });
          });

          describe("subsequent checkpoints", () => {
            it(`should return a tuple containing the checkpoint${
              name === "MemorySaver" ? " with pending_sends" : ""
            }`, async () => {
              expect(childTuple).not.toBeUndefined();
              // TODO: only MemorySaver does this - is this still a requirement for checkpoint savers?
              const pending_sends =
                name === "MemorySaver" ? [["add_fish"]] : [];
              expect(childTuple?.checkpoint).toEqual({
                ...generatedChildTuple.checkpoint,
                pending_sends,
              });
            });

            it("should return a tuple containing the checkpoint's metadata without modification", () => {
              expect(childTuple?.metadata).not.toBeUndefined();
              expect(childTuple?.metadata).toEqual(
                generatedChildTuple.metadata
              );
            });

            it("should return a tuple containing a config object that has the correct thread_id, checkpoint_ns, and checkpoint_id", () => {
              expect(childTuple?.config).not.toBeUndefined();
              expect(childTuple?.config).toEqual(
                expect.objectContaining({
                  configurable: {
                    thread_id,
                    checkpoint_ns,
                    checkpoint_id: childCheckpointId,
                  },
                })
              );
            });

            it("should return a tuple containing a parentConfig with the correct thread_id, checkpoint_ns, and checkpoint_id", () => {
              expect(childTuple?.parentConfig).toEqual(
                expect.objectContaining({
                  configurable: {
                    thread_id,
                    checkpoint_ns,
                    checkpoint_id: parentCheckpointId,
                  },
                })
              );
            });

            it("should return a tuple containing the writes against the checkpoint", () => {
              expect(childTuple?.pendingWrites).toEqual([
                ["add_fish", "animals", ["fish"]],
              ]);
            });
          });
        });

        describe("when checkpoint_id is not provided", () => {
          it(`should return a tuple containing the latest checkpoint${
            name === "MemorySaver" ||
            name === "@langchain/langgraph-checkpoint-postgres"
              ? " with pending_sends"
              : ""
          }`, async () => {
            expect(latestTuple).not.toBeUndefined();
            // TODO: only MemorySaver does this - is this still a requirement for checkpoint savers?
            const pending_sends =
              name === "MemorySaver" ||
              name === "@langchain/langgraph-checkpoint-postgres"
                ? [["add_fish"]]
                : [];
            expect(latestTuple?.checkpoint).toEqual({
              ...generatedChildTuple.checkpoint,
              pending_sends,
            });
          });

          it("should return a tuple containing the latest checkpoint's metadata without modification", () => {
            expect(latestTuple?.metadata).not.toBeUndefined();
            expect(latestTuple?.metadata).toEqual(generatedChildTuple.metadata);
          });

          it("should return a tuple containing a config object that has the correct thread_id, checkpoint_ns, and checkpoint_id for the latest checkpoint", () => {
            expect(latestTuple?.config).not.toBeUndefined();
            expect(latestTuple?.config).toEqual(
              expect.objectContaining({
                configurable: {
                  thread_id,
                  checkpoint_ns,
                  checkpoint_id: childCheckpointId,
                },
              })
            );
          });

          it("should return a tuple containing a parentConfig with the correct thread_id, checkpoint_ns, and checkpoint_id for the latest checkpoint's parent", () => {
            expect(latestTuple?.parentConfig).toEqual(
              expect.objectContaining({
                configurable: {
                  thread_id,
                  checkpoint_ns,
                  checkpoint_id: parentCheckpointId,
                },
              })
            );
          });

          it("should return a tuple containing the writes against the latest checkpoint", () => {
            expect(latestTuple?.pendingWrites).toEqual([
              ["add_fish", "animals", ["fish"]],
            ]);
          });
        });
      });

      describe("failure cases", () => {
        it("should return undefined if the checkpoint_id is not found", async () => {
          const configWithInvalidCheckpointId = mergeConfigs(
            initializerConfig,
            { configurable: { checkpoint_ns, checkpoint_id: uuid6(-3) } }
          );
          const checkpointTuple = await saver.getTuple(
            configWithInvalidCheckpointId
          );
          expect(checkpointTuple).toBeUndefined();
        });

        // tagged "[compatibility]" because this is how the other implementations behave, however it seems unlikely that this is a valid precondition for a call to `getTuple`
        it("[compatibility] should return undefined if the thread_id is missing", async () => {
          const missingThreadIdConfig: RunnableConfig = {
            ...initializerConfig,
            configurable: Object.fromEntries(
              Object.entries(initializerConfig.configurable ?? {}).filter(
                ([key]) => key !== "thread_id"
              )
            ),
          };

          expect(await saver.getTuple(missingThreadIdConfig)).toBeUndefined();
        });
      });
    });
  });
}
