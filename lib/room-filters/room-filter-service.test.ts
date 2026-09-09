import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import { saveRoomFiltersInputSchema } from "@/lib/room-filters/room-filter-input";
import { RoomFilterService, type FilterRoom, type LockedFilterRoom, type RoomFilterRepository } from "@/lib/room-filters/room-filter-service";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

const defaults: RoomFilterValues = { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [] };
const now = new Date("2026-09-06T12:00:00Z");
const hostToken = generateParticipantAccessToken();
const guestToken = generateParticipantAccessToken();

class MemoryFilterRepository implements RoomFilterRepository {
  room: FilterRoom | null = { status: "waiting", expiresAt: new Date(now.getTime() + 60000) };
  filters = defaults;
  writes = 0;
  saves = new Map<string, string>();
  async inLockedRoom<T>(_roomCode: string, operation: (room: FilterRoom | null, locked: LockedFilterRoom) => Promise<T>): Promise<T> {
    return operation(this.room, {
      findParticipantRole: async hash => {
        if (hash === hashParticipantAccessToken(hostToken)) {
          return "host";
        }
        if (hash === hashParticipantAccessToken(guestToken)) {
          return "guest";
        }
        return null;
      },
      readFilters: async () => this.filters,
      listGenres: async () => [
        { id: 1, name: "Комедія" },
        { id: 2, name: "Драма" },
      ],
      findSavePayloadHash: async id => this.saves.get(id) ?? null,
      saveFilters: async (input, hash) => {
        this.filters = input.filters;
        this.saves.set(input.requestId, hash);
        this.writes++;
      },
    });
  }
}

test("filter boundary requires exact types, normalizes room/genre IDs and rejects forged authority", () => {
  const input = { roomCode: " abcd ", requestId: randomUUID(), filters: { ...defaults, genreIds: [2, 1, 2] } };
  assert.deepEqual(saveRoomFiltersInputSchema.parse(input), { ...input, roomCode: "ABCD", filters: { ...defaults, genreIds: [1, 2] } });
  for (const filters of [
    { ...defaults, netflixOnly: "false" },
    { ...defaults, underTwoHours: 1 },
    { ...defaults, yearFilter: "recent" },
    { ...defaults, genreIds: [-1] },
    { ...defaults, genreIds: [1.5] },
    { ...defaults, genreIds: [2147483648] },
    { ...defaults, genreIds: ["1"] },
    { ...defaults, extra: true },
  ])
    assert.equal(saveRoomFiltersInputSchema.safeParse({ ...input, filters }).success, false);
  assert.equal(saveRoomFiltersInputSchema.safeParse({ ...input, role: "host" }).success, false);
  assert.equal(saveRoomFiltersInputSchema.safeParse({ ...input, participantId: randomUUID() }).success, false);
  assert.equal(saveRoomFiltersInputSchema.safeParse({ ...input, roomCode: "!" }).success, false);
  assert.equal(saveRoomFiltersInputSchema.safeParse({ ...input, requestId: "bad" }).success, false);
});

test("only a current host can read or save filters in a waiting room", async () => {
  const repository = new MemoryFilterRepository();
  const service = new RoomFilterService(repository, { now: (): Date => now });
  const input = { roomCode: "ABCD", requestId: randomUUID(), filters: defaults };
  for (const token of [null, "invalid", guestToken, generateParticipantAccessToken()]) {
    assert.deepEqual(await service.read("ABCD", token), { status: "unavailable" });
    assert.deepEqual(await service.save(input, token), { status: "unavailable" });
  }
  for (const status of ["playing", "matched", "exhausted", "closed"] as const) {
    repository.room = { status, expiresAt: new Date(now.getTime() + 60000) };
    assert.deepEqual(await service.read("ABCD", hostToken), { status: "unavailable" });
    assert.deepEqual(await service.save(input, hostToken), { status: "unavailable" });
  }
  for (const room of [null, { status: "waiting" as const, expiresAt: now }]) {
    repository.room = room;
    assert.deepEqual(await service.save(input, hostToken), { status: "unavailable" });
  }
  assert.equal(repository.writes, 0);
});

test("saves valid filters, rejects absent genres and replays old saves without reverting newer values", async () => {
  const repository = new MemoryFilterRepository();
  const service = new RoomFilterService(repository, { now: (): Date => now });
  const initial = await service.read("ABCD", hostToken);
  assert.equal(initial.status, "ready");
  assert.deepEqual(initial.snapshot.filters, defaults);
  const first = { roomCode: "ABCD", requestId: randomUUID(), filters: { ...defaults, netflixOnly: true, genreIds: [1, 2] } };
  const second = { ...first, requestId: randomUUID(), filters: { ...defaults, underTwoHours: true, yearFilter: "old" as const } };
  assert.deepEqual(await service.save(first, hostToken), { status: "saved", filters: first.filters });
  assert.deepEqual(await service.save(second, hostToken), { status: "saved", filters: second.filters });
  assert.deepEqual(await service.save(first, hostToken), { status: "saved", filters: second.filters });
  assert.deepEqual(await service.save({ ...first, filters: defaults }, hostToken), { status: "conflict" });
  assert.deepEqual(await service.save({ ...first, requestId: randomUUID(), filters: { ...defaults, genreIds: [3] } }, hostToken), {
    status: "validation_error",
  });
  assert.equal(repository.writes, 2);
  assert.deepEqual(repository.filters, second.filters);
});
