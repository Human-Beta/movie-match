import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { FilterRequestStorage } from "@/app/join/[roomCode]/filter-request-storage";

test("pending saves survive reload with their exact payload and are isolated by room", () => {
  const values = new Map<string, string>();
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const request = { requestId: randomUUID(), filters: { netflixOnly: true, underTwoHours: true, yearFilter: "new" as const, genreIds: [1, 2] } };
  const pending = new FilterRequestStorage(storage, "ABCD");
  pending.persist(request);
  assert.deepEqual(new FilterRequestStorage(storage, "ABCD").read(), request);
  assert.equal(new FilterRequestStorage(storage, "EFGH").read(), null);
  pending.clear(randomUUID());
  assert.deepEqual(pending.read(), request);
  pending.clear(request.requestId);
  assert.equal(pending.read(), null);
});

test("unavailable or corrupt storage fails explicitly instead of silently losing idempotency", () => {
  const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: () => "bad",
    setItem: () => {
      throw new Error("Unavailable");
    },
    removeItem: () => {},
  };
  const pending = new FilterRequestStorage(storage, "ABCD");
  assert.throws(() => pending.read());
  assert.throws(() =>
    pending.persist({ requestId: randomUUID(), filters: { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [] } }),
  );
});
