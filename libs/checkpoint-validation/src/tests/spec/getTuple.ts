import {
  CheckpointTuple,
  uuid6,
  type BaseCheckpointSaver,
} from "@langchain/langgraph-checkpoint";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";
import { mergeConfigs, RunnableConfig } from "@langchain/core/runnables";
import { CheckpointSaverTestInitializer } from "../../types.js";
import { parentAndChildCheckpointTuplesWithWrites } from "./data.js";

export function getTupleTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#getTuple`, () => {
    let saver!: T;
    let initializerConfig!: RunnableConfig;
    const thread_id = uuid6(-3);

    const baseConfig = {
      configurable: {
        thread_id,
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

      let parentCheckpointId!: string;
      let childCheckpointId!: string;

      let generatedParentTuple!: CheckpointTuple;
      let generatedChildTuple!: CheckpointTuple;

      beforeEach(async () => {
        parentCheckpointId = uuid6(-3);
        childCheckpointId = uuid6(-3);

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
          [["animals", ["dog"]]],
          "add_dog_task"
        );
        await saver.putWrites(
          generatedParentTuple.config,
          [["animals", ["cat"]]],
          "add_cat_task"
        );

        await saver.put(
          // parent config here because that's what would be returned by the previous `put`
          generatedParentTuple.config,
          generatedChildTuple.checkpoint,
          generatedChildTuple.metadata!,
          {}
        );
      });

      describe("success cases", () => {
        it("should return the parent checkpoint tuple when requested by id", async () => {
          const parentTuple = await saver.getTuple(generatedParentTuple.config);
          expect(parentTuple).not.toBeUndefined();
          expect(parentTuple?.checkpoint).not.toBeUndefined();
          expect(parentTuple?.metadata).not.toBeUndefined();
          expect(parentTuple?.config).not.toBeUndefined();
          expect(parentTuple?.parentConfig).toBeUndefined();

          expect(parentTuple?.checkpoint).toEqual(
            generatedParentTuple.checkpoint
          );
          expect(parentTuple?.metadata).toEqual(generatedParentTuple.metadata);
          expect(parentTuple?.config).toEqual(
            expect.objectContaining(
              generatedParentTuple.config as Record<string, unknown>
            )
          );
        });

        it("should return the child checkpoint tuple when requested by id", async () => {
          const childTuple = await saver.getTuple(generatedChildTuple.config);
          expect(childTuple).not.toBeUndefined();
          expect(childTuple?.checkpoint).not.toBeUndefined();
          expect(childTuple?.metadata).not.toBeUndefined();
          expect(childTuple?.config).not.toBeUndefined();
          expect(childTuple?.parentConfig).not.toBeUndefined();

          expect(childTuple?.checkpoint).toEqual(
            generatedChildTuple.checkpoint
          );
          expect(childTuple?.metadata).toEqual(generatedChildTuple.metadata);

          expect(childTuple?.config).toEqual(
            expect.objectContaining(
              generatedChildTuple.config as Record<string, unknown>
            )
          );

          // TODO: Should this match the full parent config, or just these keys? MemorySaver only includes just these keys
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

        it("should return the latest checkpoint tuple when no checkpoint_id is provided", async () => {
          const configWithNoCheckpointId = mergeConfigs(initializerConfig, {
            configurable: {
              checkpoint_ns,
            },
          });

          const checkpointTuple = await saver.getTuple(
            configWithNoCheckpointId
          );

          expect(checkpointTuple).not.toBeUndefined();
          expect(checkpointTuple?.checkpoint).not.toBeUndefined();
          expect(checkpointTuple?.metadata).not.toBeUndefined();
          expect(checkpointTuple?.config).not.toBeUndefined();
          expect(checkpointTuple?.parentConfig).not.toBeUndefined();

          expect(checkpointTuple?.checkpoint).toEqual(
            generatedChildTuple.checkpoint
          );

          expect(checkpointTuple?.metadata).toEqual(
            generatedChildTuple.metadata
          );

          expect(checkpointTuple?.config).toEqual(
            expect.objectContaining(
              generatedChildTuple.config as Record<string, unknown>
            )
          );

          expect(checkpointTuple?.parentConfig).toEqual(
            expect.objectContaining({
              configurable: {
                thread_id,
                checkpoint_ns,
                checkpoint_id: parentCheckpointId,
              },
            })
          );
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

        it("should throw if the thread_id is missing", async () => {
          const missingThreadIdConfig: RunnableConfig = {
            ...initializerConfig,
            configurable: Object.fromEntries(
              Object.entries(initializerConfig.configurable ?? {}).filter(
                ([key]) => key !== "thread_id"
              )
            ),
          };

          await expect(
            async () => await saver.getTuple(missingThreadIdConfig)
          ).rejects.toThrow();
        });
      });
    });
  });
}
