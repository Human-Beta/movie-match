import assert from "node:assert/strict";
import test from "node:test";

import { isRoomExpired } from "@/lib/rooms/room-expiration";

test("expires a room at its expiration timestamp", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");

  assert.equal(isRoomExpired(now, now), true);
  assert.equal(isRoomExpired(new Date("2026-09-27T11:59:59.999Z"), now), true);
});

test("keeps a room active before its expiration timestamp", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");

  assert.equal(isRoomExpired(new Date("2026-09-27T12:00:00.001Z"), now), false);
});
