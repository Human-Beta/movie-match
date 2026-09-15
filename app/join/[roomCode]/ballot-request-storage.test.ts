import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { BallotRequestStorage } from "@/app/join/[roomCode]/ballot-request-storage";

test("keeps a pending ballot isolated by room and round until its matching request completes", () => {
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
  const request = {
    requestId: randomUUID(),
    votes: [
      { movieId: 1, value: "want_to_watch" as const },
      { movieId: 2, value: "could_watch" as const },
      { movieId: 3, value: "not_now" as const },
    ],
  };
  const ballot = new BallotRequestStorage(storage, "ABCD", "11111111-1111-4111-8111-111111111111");

  ballot.persist(request);
  assert.deepEqual(new BallotRequestStorage(storage, "ABCD", "11111111-1111-4111-8111-111111111111").read(), request);
  assert.equal(new BallotRequestStorage(storage, "ABCD", "22222222-2222-4222-8222-222222222222").read(), null);
  assert.equal(new BallotRequestStorage(storage, "EFGH", "11111111-1111-4111-8111-111111111111").read(), null);

  ballot.clear(randomUUID());
  assert.deepEqual(ballot.read(), request);
  ballot.clear(request.requestId);
  assert.equal(ballot.read(), null);
});
