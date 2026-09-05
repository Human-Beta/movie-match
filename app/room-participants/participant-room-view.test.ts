import assert from "node:assert/strict";
import test from "node:test";

import { getParticipantRoomView } from "@/app/room-participants/participant-room-view";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

function snapshot(roomState: PublicParticipantSnapshot["roomState"], participantCount: number): PublicParticipantSnapshot {
  return { roomState, participantCount, participants: [] };
}

test("maps authoritative snapshots to waiting, ready, advanced, and unavailable views", () => {
  assert.equal(getParticipantRoomView(snapshot("waiting", 0)), "waiting");
  assert.equal(getParticipantRoomView(snapshot("waiting", 1)), "waiting");
  assert.equal(getParticipantRoomView(snapshot("waiting", 2)), "ready");
  assert.equal(getParticipantRoomView(snapshot("playing", 2)), "advanced");
  assert.equal(getParticipantRoomView(snapshot("matched", 2)), "advanced");
  assert.equal(getParticipantRoomView(snapshot("exhausted", 2)), "advanced");
  assert.equal(getParticipantRoomView(snapshot("closed", 2)), "unavailable");
});
