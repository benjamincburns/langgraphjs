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
import { it_skipIfNot } from "../utils.js";

/**
 * Exercises the `list` method of the CheckpointSaver.
 * 
 * IMPORTANT NOTE: This test relies on the `getTuple` method of the saver functioning properly. If you have failures in 
 * `getTuple`, you should fix them before addressing the failures in this test.
 *
 * @param name the name of the CheckpointSaver
 * @param initializer the initializer for the CheckpointSaver
 */
export function listTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#list`, () => {
    let saver: T;
    let initializerConfig: RunnableConfig;
    const threadIds: string[] = [];
    const namespaces = [ "", "child" ];

    const generatedTuples: {
      child: CheckpointTuple;
      parent: CheckpointTuple;
    }[] = [];

    const expectedTuples: {
      child: CheckpointTuple;
      parent: CheckpointTuple;
    }[] = [];
      
    beforeAll(async () => {
      const baseConfig = {
        configurable: { },
      };
      initializerConfig = mergeConfigs(
        baseConfig,
        await initializer.configure?.(baseConfig)
      );
      saver = await initializer.createSaver(initializerConfig);

      for (const checkpoint_ns of namespaces) {
        for (let i=0; i<3; i += 1) {
          const thread_id = uuid6(-3);
          threadIds.push(thread_id);

          const parentCheckpointId = uuid6(-3);
          const childCheckpointId = uuid6(-3);

          initializerConfig.configurable!.thread_id = thread_id;

          const generated = parentAndChildCheckpointTuplesWithWrites(
            parentCheckpointId,
            childCheckpointId,
            checkpoint_ns,
            initializerConfig
          );
          
          generatedTuples.push(generated);

          const existingParentCheckpoint = await saver.get(
            generated.parent.config
          );
          expect(existingParentCheckpoint).toBeUndefined();

          const existingChildCheckpoint = await saver.get(
            generated.child.config
          );

          expect(existingChildCheckpoint).toBeUndefined();

          // Remove checkpoint_id from parentPutConfig to emulate how the first put of a new thread typically works
          const parentPutConfig = {
            ...generated.parent.config,
            configurable: Object.fromEntries(
              Object.entries(
                generated.parent.config.configurable ?? {}
              ).filter(([key]) => key !== "checkpoint_id")
            ),
          };

          await saver.put(
            parentPutConfig,
            generated.parent.checkpoint,
            generated.parent.metadata!,
            {}
          );

          await saver.putWrites(
            generated.parent.config,
            [[TASKS, ["add_fish"]]],
            "pending_sends_task"
          );

          await saver.put(
            // parent config here because that's what would be returned by the previous `put`
            generated.parent.config,
            generated.child.checkpoint,
            generated.child.metadata!,
            {}
          );

          await saver.putWrites(
            generated.child.config,
            [["animals", ["fish"]]],
            "add_fish"
          );
          
          const expected = {
            parent: await saver.getTuple(generated.parent.config),
            child: await saver.getTuple(generated.child.config),
          };
          
          if (expected.parent === undefined || expected.child === undefined) {
            throw new Error("expected tuple not found - see test failures for getTuple");
          }
          
          expectedTuples.push({
            parent: expected.parent,
            child: expected.child,
          });
        }
      }
    });

    afterAll(async () => {
      await initializer.destroySaver?.(saver, initializerConfig);
    });
    
    // combinatorial dimensions:
    // - thread_id - lists from specific thread, or all threads if undefined
    // - checkpoint_ns - lists from specific namespace, or all namespaces if undefined
    // - limit (incl undefined) - limit the number of tuples returned, starting from the most recent
    // - before (incl undefined) - return only tuples with checkpoint_id less than before.configurable.checkpoint_id
    

    it("should return all tuples when no filters are applied", async () => {
      // list doesn't specify any ordering, so we can't make any assertions about the order of the tuples
      const actualTuplesArray = await toArray(saver.list({}));
      const actualTuplesMap = toMap(actualTuplesArray);
      const expectedTuplesArray = expectedTuples.flatMap((tuplePair) => [
        {
          ...tuplePair.parent,
          // TODO: is it correct to ignore pendingWrites here? MemorySaver returns them, mongo doesn't
          pendingWrites: actualTuplesMap.get(tuplePair.parent.checkpoint.id)?.pendingWrites,
        },
        {
          ...tuplePair.child,
          // TODO: is it correct to ignore pendingWrites here? MemorySaver returns them, mongo doesn't
          pendingWrites: actualTuplesMap.get(tuplePair.child.checkpoint.id)?.pendingWrites,
        },
      ]);
      const expectedTuplesMap = toMap(expectedTuplesArray);          

      expect(actualTuplesArray.length).toEqual(expectedTuplesArray.length);
      expect(actualTuplesMap).toEqual(expectedTuplesMap);
    });


    it_skipIfNot(name, "MemorySaver")(
      "should return tuples from a specific thread when thread_id is provided but checkpoint_ns is not",
      async () => {
        for (const thread_id of threadIds) {
          const actualTuplesArray = await toArray(
            saver.list({
              configurable: { thread_id },
            })
          );

          const actualTuplesMap = toMap(actualTuplesArray);

          const expectedTuplesArray = expectedTuples
            .filter(
              (tuplePair) =>
                tuplePair.parent.config.configurable?.thread_id === thread_id
            )
            .flatMap((tuplePair) => [
              {
                ...tuplePair.parent,
                pendingWrites: actualTuplesMap.get(
                  tuplePair.parent.checkpoint.id
                )?.pendingWrites,
              },
              {
                ...tuplePair.child,
                pendingWrites: actualTuplesMap.get(
                  tuplePair.child.checkpoint.id
                )?.pendingWrites,
              },
            ]);

          const expectedTuplesMap = toMap(expectedTuplesArray);

          expect(actualTuplesArray.length).toEqual(expectedTuplesArray.length);
          expect(actualTuplesMap).toEqual(expectedTuplesMap);
        }
      }
    );

    it("should return tuples from a specific thread when thread_id and checkpoint_ns are provided", async () => {
      for (const { child, parent } of expectedTuples) {
        const thread_id = parent.config.configurable?.thread_id;
        const checkpoint_ns = parent.config.configurable?.checkpoint_ns ?? "";

        const queryConfig: RunnableConfig = {
          configurable: {
            thread_id,
            checkpoint_ns
          }
        };

        const actualTuplesArray = await toArray(
          saver.list(queryConfig)
        );

        expect(actualTuplesArray.length).toEqual(2);

        const actualTuplesMap = toMap(actualTuplesArray);

        const expectedTuplesArray = [
          {
            ...parent,
            pendingWrites: actualTuplesMap.get(parent.checkpoint.id)?.pendingWrites ,
          },
          {
            ...child,
            pendingWrites: actualTuplesMap.get(child.checkpoint.id)?.pendingWrites,
          },
        ];
        const expectedTuplesMap = toMap(expectedTuplesArray);

        expect(actualTuplesArray.length).toEqual(expectedTuplesArray.length);
        expect(actualTuplesMap).toEqual(expectedTuplesMap);
      }
    });
  });
}

async function toArray(generator: AsyncGenerator<CheckpointTuple>): Promise<CheckpointTuple[]> {
  const result = [];
  for await (const item of generator) {
    result.push(item);
  }
  return result;
}

function toMap(tuples: CheckpointTuple[]): Map<string, CheckpointTuple> {
  const result = new Map<string, CheckpointTuple>();
  for (const item of tuples) {
    const key = item.checkpoint.id;
    result.set(key, item);
  }
  return result;
}
