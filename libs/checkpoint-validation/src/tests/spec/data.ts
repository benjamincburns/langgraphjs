import type { CheckpointTuple } from "@langchain/langgraph-checkpoint";
import { mergeConfigs, type RunnableConfig } from "@langchain/core/runnables";

export function emptyInitialCheckpointTuple(
  checkpoint_id: string,
  checkpoint_ns: string,
  config: RunnableConfig
): CheckpointTuple {
  return {
    config: mergeConfigs(config, {
      configurable: {
        checkpoint_id,
        checkpoint_ns,
      },
    }),
    checkpoint: {
      v: 1,
      ts: new Date().toISOString(),
      id: checkpoint_id,
      channel_values: {},
      channel_versions: {},
      versions_seen: {},
      pending_sends: [],
    },

    metadata: {
      source: "input",
      step: -1,
      writes: null,
      parents: {},
    },
  };
}

export function parentAndChildCheckpointTuplesWithWrites(
  parentCheckpointId: string,
  childCheckpointId: string,
  checkpoint_ns: string,
  config: RunnableConfig
): { parent: CheckpointTuple; child: CheckpointTuple } {
  return {
    parent: {
      checkpoint: {
        v: 1,
        ts: new Date().toISOString(),
        id: parentCheckpointId,
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
        pending_sends: [],
      },
      metadata: {
        source: "input",
        step: -1,
        writes: null,
        parents: {},
      },
      config: mergeConfigs(config, {
        configurable: {
          checkpoint_id: parentCheckpointId,
          checkpoint_ns,
        },
      }),
    },
    child: {
      checkpoint: {
        v: 2,
        ts: new Date().toISOString(),
        id: childCheckpointId,
        channel_values: {
          animals: ["dog", "cat"],
        },
        channel_versions: {
          animals: 1,
        },
        versions_seen: {}, // TODO: what do I do with this?
        pending_sends: [],
      },
      metadata: {
        source: "loop",
        step: 0,
        writes: {
          add_dog_task: {
            animals: "dog",
          },
          add_cat_task: {
            animals: "cat",
          },
        },
        parents: {
          checkpoint_ns: parentCheckpointId,
        },
      },
      config: mergeConfigs(config, {
        configurable: {
          checkpoint_id: childCheckpointId,
          checkpoint_ns,
        },
      }),
    },
  };
}
