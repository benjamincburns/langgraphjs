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

export function getTupleTests<T extends BaseCheckpointSaver>(
  name: string,
  initializer: CheckpointSaverTestInitializer<T>
) {
  describe(`${name}#getTuple`, () => {
    let saver!: T;
    let config!: RunnableConfig;
    let thread_id!: string;

    beforeEach(async () => {
      thread_id = uuid6(-3);

      const baseConfig = {
        configurable: {
          thread_id,
        },
      };

      const initializerConfig = await initializer.configure?.(config);

      config = mergeConfigs(baseConfig, initializerConfig);
      saver = await initializer.createSaver(config);
    });

    afterEach(async () => {
      await initializer.destroySaver?.(saver, config);
    });

    describe.each(["root", "child"])("namespace: %s", (namespace) => {
      const checkpoint_ns = namespace === "root" ? '' : namespace;

      let parentCheckpointId!: string;
      let childCheckpointId!: string;

      let parentConfig: RunnableConfig;
      let childConfig: RunnableConfig;

      let parentMetadata!: CheckpointMetadata;
      let parentCheckpoint!: Checkpoint;

      let childMetadata!: CheckpointMetadata;
      let childCheckpoint!: Checkpoint;
    
      beforeEach(async () => {
        parentCheckpointId = uuid6(-3);
        childCheckpointId = uuid6(-3);

        config = mergeConfigs(config, {
          configurable: { checkpoint_ns },
        });

        const existingParentCheckpoint = await saver.get(mergeConfigs(config, { configurable: { checkpoint_id: parentCheckpointId } }));
        expect(existingParentCheckpoint).toBeUndefined();

        const existingChildCheckpoint = await saver.get(mergeConfigs(config, { configurable: { checkpoint_id: childCheckpointId } }));
        expect(existingChildCheckpoint).toBeUndefined();

        const checkpointTuple = emptyInitialCheckpointTuple(parentCheckpointId, "root", config);

        parentCheckpoint = {
          ...checkpointTuple.checkpoint,
        };
        parentMetadata = checkpointTuple.metadata!;
        
        parentConfig = mergeConfigs(config, await saver.put(config, parentCheckpoint, parentMetadata, {}));
        
        await saver.putWrites(parentConfig, [["animals", ["dog"]]], "add_dog_task");
        await saver.putWrites(parentConfig, [["animals", ["cat"]]], "add_cat_task");

        const childCheckpointTuple = emptyInitialCheckpointTuple(childCheckpointId, "child", config);

        childCheckpoint = {
          ...childCheckpointTuple.checkpoint,
          v: 2,
          ts: new Date().toISOString(),
          channel_values: {
            "animals": ["dog", "cat"],
          },
          channel_versions: {
            "animals": 1,
          },
        };

        childMetadata = {
          source: "loop",
          step: 0,
          writes: {
            "add_dog_task": {
              "animals": "dog",
            },
            "add_cat_task": {
              "animals": "cat",
            },
          },
          parents: {
            checkpoint_ns: parentCheckpointId,
          },
        };

        
        childConfig = mergeConfigs(parentConfig, await saver.put(parentConfig, childCheckpoint, childMetadata, {}));

        expect(childConfig.configurable?.checkpoint_id).toEqual(childCheckpointId);
        expect(parentConfig.configurable?.checkpoint_id).toEqual(parentCheckpointId);
      });
      
      it("should return the parent checkpoint tuple when requested by id", async () => {
        const checkpointTuple = await saver.getTuple(parentConfig);
        expect(checkpointTuple).not.toBeUndefined();
        expect(checkpointTuple?.checkpoint).not.toBeUndefined();
        expect(checkpointTuple?.metadata).not.toBeUndefined();
        expect(checkpointTuple?.config).not.toBeUndefined();
        expect(checkpointTuple?.parentConfig).toBeUndefined();

        expect(checkpointTuple?.checkpoint).toEqual(parentCheckpoint);
        expect(checkpointTuple?.metadata).toEqual(parentMetadata);
        expect(checkpointTuple?.config).toEqual(parentConfig);
      });

      it("should return the child checkpoint tuple when requested by id", async () => {
        const checkpointTuple = await saver.getTuple(childConfig);
        expect(checkpointTuple).not.toBeUndefined();
        expect(checkpointTuple?.checkpoint).not.toBeUndefined();
        expect(checkpointTuple?.metadata).not.toBeUndefined();
        expect(checkpointTuple?.config).not.toBeUndefined();
        expect(checkpointTuple?.parentConfig).not.toBeUndefined();

        expect(checkpointTuple?.checkpoint).toEqual(childCheckpoint);
        expect(checkpointTuple?.metadata).toEqual(childMetadata);
        expect(checkpointTuple?.config).toEqual(childConfig);
        expect(checkpointTuple?.parentConfig).toEqual(parentConfig);
      });
      
      it("should return the latest checkpoint tuple when no checkpoint_id is provided", async () => {
        const checkpointTuple = await saver.getTuple(mergeConfigs(config, { configurable: { checkpoint_id: undefined } }));
        expect(checkpointTuple).not.toBeUndefined();
        expect(checkpointTuple?.checkpoint).not.toBeUndefined();
        expect(checkpointTuple?.metadata).not.toBeUndefined();
        expect(checkpointTuple?.config).not.toBeUndefined();
        expect(checkpointTuple?.parentConfig).not.toBeUndefined();
        
        expect(checkpointTuple?.checkpoint).toEqual(childCheckpoint);
        expect(checkpointTuple?.metadata).toEqual(childMetadata);
        expect(checkpointTuple?.config).toEqual(childConfig);
        expect(checkpointTuple?.parentConfig).toEqual(parentConfig);
      });
      
    });
  });
}
