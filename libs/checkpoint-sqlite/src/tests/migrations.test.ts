import {
  Checkpoint,
  CheckpointTuple,
  copyCheckpoint,
  uuid6,
} from "@langchain/langgraph-checkpoint";

import Database, { Database as DatabaseType } from "better-sqlite3";
import { SqliteSaver } from "../index.js";

const checkpoint1_id = uuid6(-1);
const checkpoint2_id = uuid6(-1);
const expectedCheckpointTuple1: CheckpointTuple = {
  checkpoint: {
    v: 1,
    id: checkpoint1_id,
    ts: "2024-04-19T17:19:07.952Z",
    channel_values: {
      someKey1: "someValue1",
    },
    channel_versions: {
      someKey1: 1,
    },
    versions_seen: {
      someKey3: {
        someKey4: 1,
      },
    },
    pending_sends: [],
  },
  metadata: {
    source: "input",
    step: -1,
    writes: {},
    parents: {},
  },
  config: {
    configurable: {
      thread_id: "1",
      checkpoint_ns: "",
      checkpoint_id: checkpoint1_id,
    },
  },
  pendingWrites: [],
};
const expectedCheckpointTuple2: CheckpointTuple = {
  checkpoint: {
    v: 1,
    id: checkpoint2_id,
    ts: "2024-04-20T17:19:07.952Z",
    channel_values: {
      someKey1: "someValue2",
    },
    channel_versions: {
      someKey1: 2,
    },
    versions_seen: {
      someKey3: {
        someKey4: 2,
      },
    },
    pending_sends: [],
  },
  metadata: {
    source: "update",
    step: 0,
    writes: {},
    parents: {},
  },
  config: {
    configurable: {
      thread_id: "1",
      checkpoint_ns: "",
      checkpoint_id: checkpoint2_id,
    },
  },
  pendingWrites: [],
};

function storeCheckpointMigration0(
  db: DatabaseType,
  checkpointTuple: CheckpointTuple
) {
  const preparedCheckpoint: Partial<Checkpoint> = copyCheckpoint(
    checkpointTuple.checkpoint
  );
  delete preparedCheckpoint.pending_sends;

  const sql = `
    INSERT INTO checkpoints (
      thread_id,
      checkpoint_ns,
      checkpoint_id,
      parent_checkpoint_id,
      type,
      checkpoint,
      metadata
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?
    )
  `;

  db.prepare(sql).run(
    checkpointTuple.config.configurable?.thread_id,
    checkpointTuple.config.configurable?.checkpoint_ns,
    checkpointTuple.checkpoint.id,
    null,
    "json",
    JSON.stringify(preparedCheckpoint),
    JSON.stringify(checkpointTuple.metadata)
  );
}

describe("migrations", () => {
  let checkpointer: SqliteSaver;
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(":memory:");
    checkpointer = new SqliteSaver(db);

    checkpointer.migrate(0);

    storeCheckpointMigration0(db, expectedCheckpointTuple1);
    storeCheckpointMigration0(db, expectedCheckpointTuple2);
  });

  it("should be able to retrieve old checkpoints", async () => {
    const actualCheckpointTuple1 = await checkpointer.getTuple(
      expectedCheckpointTuple1.config
    );
    expect(actualCheckpointTuple1).toEqual(expectedCheckpointTuple1);

    const actualCheckpointTuple2 = await checkpointer.getTuple(
      expectedCheckpointTuple2.config
    );
    expect(actualCheckpointTuple2).toEqual(expectedCheckpointTuple2);
  });
});
