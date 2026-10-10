import assert from "node:assert/strict";
import test from "node:test";
import { isCleanupAuthorized, ROOM_CLEANUP_MAX_BATCHES, RoomCleanupService } from "@/lib/room-cleanup/room-cleanup-service";

test("cleanup requires the configured server secret and fails closed", () => {
  const secret = "x".repeat(40);
  assert.equal(isCleanupAuthorized(`Bearer ${secret}`, secret), true);
  for (const header of [null, "", secret, `Bearer ${"y".repeat(40)}`, `Bearer ${secret}extra`]) {
    assert.equal(isCleanupAuthorized(header, secret), false);
  }
  assert.equal(isCleanupAuthorized("Bearer undefined", undefined), false);
  assert.equal(isCleanupAuthorized("Bearer short", "short"), false);
});

test("cleanup bounds backlog work and stops when drained", async () => {
  let calls = 0;
  const service = new RoomCleanupService({
    deleteExpiredBatch: async (): Promise<number> => {
      calls += 1;
      return 100;
    },
  });
  assert.deepEqual(await service.run(), { status: "completed", deletedRooms: 100 * ROOM_CLEANUP_MAX_BATCHES });
  assert.equal(calls, ROOM_CLEANUP_MAX_BATCHES);
  const batches = [5, 0];
  assert.deepEqual(await new RoomCleanupService({ deleteExpiredBatch: async (): Promise<number> => batches.shift() ?? 999 }).run(), {
    status: "completed",
    deletedRooms: 5,
  });
});

test("cleanup reports committed progress on failure without leaking driver details and can retry", async () => {
  let calls = 0;
  const service = new RoomCleanupService({
    deleteExpiredBatch: async (): Promise<number> => {
      calls += 1;
      if (calls === 2) {
        throw new Error("password=secret connection URL");
      }
      return calls === 1 ? 100 : 0;
    },
  });
  assert.deepEqual(await service.run(), { status: "failed", deletedRooms: 100 });
  assert.deepEqual(await service.run(), { status: "completed", deletedRooms: 0 });
});
