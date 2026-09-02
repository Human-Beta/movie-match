import assert from "node:assert/strict";
import test from "node:test";

import { joinRoomInputSchema, PARTICIPANT_NAME_MAX_CODE_POINTS } from "@/lib/participants/join-input";

test("normalizes room code and trims a valid participant name", () => {
  const result = joinRoomInputSchema.parse({
    roomCode: " ab12cd ",
    name: "  Настя  ",
  });

  assert.deepEqual(result, { roomCode: "AB12CD", name: "Настя" });
});

test("rejects blank and oversized participant names after trim", () => {
  assert.equal(joinRoomInputSchema.safeParse({ roomCode: "ABC123", name: "   " }).success, false);
  assert.equal(
    joinRoomInputSchema.safeParse({
      roomCode: "ABC123",
      name: ` ${"я".repeat(PARTICIPANT_NAME_MAX_CODE_POINTS + 1)} `,
    }).success,
    false,
  );
});

test("counts Unicode code points rather than UTF-16 code units", () => {
  const name = "🙂".repeat(PARTICIPANT_NAME_MAX_CODE_POINTS);
  const result = joinRoomInputSchema.safeParse({
    roomCode: "ABC123",
    name,
  });

  assert.equal(name.length, PARTICIPANT_NAME_MAX_CODE_POINTS * 2);
  assert.equal(Array.from(name).length, PARTICIPANT_NAME_MAX_CODE_POINTS);
  assert.equal(result.success, true);
});

test("rejects malformed room codes and unexpected boundary fields", () => {
  assert.equal(joinRoomInputSchema.safeParse({ roomCode: "AB-CD", name: "Марко" }).success, false);
  assert.equal(
    joinRoomInputSchema.safeParse({
      roomCode: "ABC123",
      name: "Марко",
      role: "host",
    }).success,
    false,
  );
});
