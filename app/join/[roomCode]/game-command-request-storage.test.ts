import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { GameCommandRequestStorage } from "@/app/join/[roomCode]/game-command-request-storage";

test("pending game commands survive reload and stay isolated by room and command", () => {
  const values = new Map<string, string>();
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: key => {
      values.delete(key);
    },
  };
  const request = { requestId: randomUUID() };
  const pendingStart = new GameCommandRequestStorage(storage, "ABCD", "start");

  pendingStart.persist(request);
  assert.deepEqual(new GameCommandRequestStorage(storage, "ABCD", "start").read(), request);
  assert.equal(new GameCommandRequestStorage(storage, "EFGH", "start").read(), null);
  assert.equal(new GameCommandRequestStorage(storage, "ABCD", "restart").read(), null);

  pendingStart.clear(randomUUID());
  assert.deepEqual(pendingStart.read(), request);
  pendingStart.clear(request.requestId);
  assert.equal(pendingStart.read(), null);
});

test("unavailable or corrupt storage fails before a command can be sent", () => {
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: () => "bad",
    setItem: () => {
      throw new Error("Unavailable");
    },
    removeItem: () => undefined,
  };
  const pending = new GameCommandRequestStorage(storage, "ABCD", "start");

  assert.throws(() => pending.read());
  assert.throws(() => pending.persist({ requestId: randomUUID() }));
});
