import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PostMatchCommandRequestStorage } from "@/app/join/[roomCode]/post-match-command-request-storage";

test("post-match commands retain one action and request ID through reload", () => {
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
  const request = { command: "search_again" as const, requestId: randomUUID() };
  const pending = new PostMatchCommandRequestStorage(storage, "ABCD");

  pending.persist(request);
  assert.deepEqual(new PostMatchCommandRequestStorage(storage, "ABCD").read(), request);
  assert.equal(new PostMatchCommandRequestStorage(storage, "EFGH").read(), null);
  pending.clear(randomUUID());
  assert.deepEqual(pending.read(), request);
  pending.clear(request.requestId);
  assert.equal(pending.read(), null);
});

test("post-match commands reject corrupt storage before a mutation can be sent", () => {
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: () => '{"command":"start"}',
    setItem: () => {
      throw new Error("Unavailable");
    },
    removeItem: () => undefined,
  };
  const pending = new PostMatchCommandRequestStorage(storage, "ABCD");

  assert.throws(() => pending.read());
  assert.throws(() => pending.persist({ command: "close", requestId: randomUUID() }));
});
