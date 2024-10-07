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
