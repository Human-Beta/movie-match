import assert from "node:assert/strict";
import test from "node:test";

import { toJoinRoomActionState } from "@/app/join/[roomCode]/join-action-state";

test("excludes participant credentials and internal identifiers from action state", () => {
  const rawAccessToken = "raw-participant-token-must-not-reach-the-client";
  const state = toJoinRoomActionState({
    status: "joined",
    participant: { id: "participant-id", name: "Настя", role: "host" },
    newSession: {
      rawAccessToken,
      expiresAt: new Date("2026-08-23T13:00:00.000Z"),
    },
  });
  const serializedState = JSON.stringify(state);

  assert.deepEqual(state, {
    status: "joined",
    participant: { name: "Настя", role: "host" },
  });
  assert.equal(serializedState.includes(rawAccessToken), false);
  assert.equal(serializedState.includes("participant-id"), false);
  assert.equal(serializedState.includes("accessToken"), false);
});
