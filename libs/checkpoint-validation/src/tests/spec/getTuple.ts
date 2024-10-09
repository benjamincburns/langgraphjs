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
import { it_skipForSomeModules } from "../utils.js";

export function getTupleTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#getTuple`, () => {
    let saver: T;
    let initializerConfig: RunnableConfig;
    beforeAll(async () => {

      const baseConfig = {
        configurable: { },
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
          [["animals", ["dog"]]],
          "add_dog_task"
        );

        await saver.putWrites(
          generatedParentTuple.config,
          [[TASKS, ["add_fish_task"]]],
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
          "add_fish_task"
        );

        await saver.putWrites(
          generatedChildTuple.config,
          [["animals", ["frog"]]],
          "add_frog_task"
        );

        parentTuple = await saver.getTuple(generatedParentTuple.config);
        childTuple = await saver.getTuple(generatedChildTuple.config);
        latestTuple = await saver.getTuple(mergeConfigs(initializerConfig, { configurable: { checkpoint_ns } }));
      });

      describe("success cases", () => {
        it("should return the parent checkpoint tuple when requested by id", async () => {
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
          childTuple = await saver.getTuple(generatedChildTuple.config);
          expect(childTuple).not.toBeUndefined();
          expect(childTuple?.checkpoint).not.toBeUndefined();
          expect(childTuple?.metadata).not.toBeUndefined();
          expect(childTuple?.config).not.toBeUndefined();
          expect(childTuple?.parentConfig).not.toBeUndefined();

          expect(childTuple?.metadata).toEqual(generatedChildTuple.metadata);

          expect(childTuple?.config).toEqual(
            expect.objectContaining(
              generatedChildTuple.config as Record<string, unknown>
            )
          );

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

        it_skipForSomeModules(name, {
          "@langchain/langgraph-checkpoint-mongodb": "doesn't return pending_sends",
          "@langchain/langgraph-checkpoint-sqlite": "doesn't return pending_sends",
        })("should return the pending sends from the parent checkpoint", async () => {
          expect(childTuple?.checkpoint).toEqual({
            ...generatedChildTuple.checkpoint,
            pending_sends: [["add_fish_task"]],
          });
        });

        it_skipForSomeModules(name, {
          "MemorySaver": "does return pending_sends"
        })("should not return the pending sends from the parent checkpoint", async () => {
          expect(childTuple?.checkpoint).toEqual(generatedChildTuple.checkpoint);
        });

        it("should return the latest checkpoint tuple when no checkpoint_id is provided", async () => {
          expect(latestTuple).not.toBeUndefined();
          expect(latestTuple?.checkpoint).not.toBeUndefined();
          expect(latestTuple?.metadata).not.toBeUndefined();
          expect(latestTuple?.config).not.toBeUndefined();
          expect(latestTuple?.parentConfig).not.toBeUndefined();

          expect(latestTuple?.metadata).toEqual(
            generatedChildTuple.metadata
          );

          expect(latestTuple?.config).toEqual(
            expect.objectContaining(
              generatedChildTuple.config as Record<string, unknown>
            )
          );

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
        
        it_skipForSomeModules(name, {
          "@langchain/langgraph-checkpoint-mongodb": "doesn't return pending_sends",
          "@langchain/langgraph-checkpoint-sqlite": "doesn't return pending_sends",
        })("should return the pending writes from the latest checkpoint when fetched with no checkpoint_id", async () => {
          expect(latestTuple?.checkpoint).toEqual({
            ...generatedChildTuple.checkpoint,
            pending_sends: [["add_fish_task"]],
          });
        });
        
        it_skipForSomeModules(name, {
          "MemorySaver": "does return pending_sends"
        })("should not return the pending writes from the latest checkpoint when fetched with no checkpoint_id", async () => {
          expect(latestTuple?.checkpoint).toEqual(generatedChildTuple.checkpoint);
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
