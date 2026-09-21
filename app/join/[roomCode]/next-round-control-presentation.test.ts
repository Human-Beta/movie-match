import assert from "node:assert/strict";
import test from "node:test";

import { getNextRoundControlPresentation } from "@/app/join/[roomCode]/next-round-control-presentation";

const roundId = "11111111-1111-4111-8111-111111111111";

test("a confirmed first readiness remains waiting until the snapshot catches up", () => {
  assert.equal(getNextRoundControlPresentation({ ownReady: false, roundId, localOutcome: { roundId, outcome: "ready" }, pending: false }), "waiting");
});

test("a second confirmation remains in progress until the successor snapshot arrives", () => {
  assert.equal(
    getNextRoundControlPresentation({ ownReady: false, roundId, localOutcome: { roundId, outcome: "started" }, pending: false }),
    "creating",
  );
});

test("a local result from an earlier round does not hide the current confirmation button", () => {
  assert.equal(
    getNextRoundControlPresentation({
      ownReady: false,
      roundId,
      localOutcome: { roundId: "22222222-2222-4222-8222-222222222222", outcome: "ready" },
      pending: false,
    }),
    "confirm",
  );
});
