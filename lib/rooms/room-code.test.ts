import assert from "node:assert/strict";
import test from "node:test";

import { generateRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/rooms/room-code";

test("normalizes a stored room code before lookup", () => {
  assert.equal(normalizeRoomCode("  ab12cd  "), "AB12CD");
});

test("rejects room codes outside the database constraint", () => {
  assert.equal(normalizeRoomCode("ABC"), null);
  assert.equal(normalizeRoomCode("ABCDEFGHI"), null);
  assert.equal(normalizeRoomCode("AB-CD"), null);
});

test("maps cryptographic bytes to the uppercase room alphabet", () => {
  const code = generateRoomCode(() => Uint8Array.from([0, 8, 13, 23, 24, 255]));

  assert.equal(code, "AJPZ29");
  assert.equal(code.length, ROOM_CODE_LENGTH);
  assert.match(code, /^[A-Z0-9]{4,8}$/);
});

test("rejects a broken random byte source", () => {
  assert.throws(() => generateRoomCode(() => Uint8Array.from([1, 2, 3])), /unexpected length/);
});
