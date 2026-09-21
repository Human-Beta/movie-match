import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { NextRoundRequestStorage } from "@/app/join/[roomCode]/next-round-request-storage";

test("pending next-round requests survive reload and stay isolated by room and round", () => {
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
  const pending = new NextRoundRequestStorage(storage, "ABCD", "11111111-1111-4111-8111-111111111111");

  pending.persist(request);
  assert.deepEqual(new NextRoundRequestStorage(storage, "ABCD", "11111111-1111-4111-8111-111111111111").read(), request);
  assert.equal(new NextRoundRequestStorage(storage, "EFGH", "11111111-1111-4111-8111-111111111111").read(), null);
  assert.equal(new NextRoundRequestStorage(storage, "ABCD", "22222222-2222-4222-8222-222222222222").read(), null);

  pending.clear(randomUUID());
  assert.deepEqual(pending.read(), request);
  pending.clear(request.requestId);
  assert.equal(pending.read(), null);
});

test("corrupt next-round storage fails before a command can be sent", () => {
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: () => '{"requestId":"not-a-uuid"}',
    setItem: () => {
      throw new Error("Unavailable");
    },
    removeItem: () => undefined,
  };
  const pending = new NextRoundRequestStorage(storage, "ABCD", "11111111-1111-4111-8111-111111111111");

  assert.throws(() => pending.read());
  assert.throws(() => pending.persist({ requestId: "not-a-uuid" }));
});
