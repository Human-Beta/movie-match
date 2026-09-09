import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { genres, participants, roomFilterSaves, roomGenres, rooms } from "@/lib/db/schema";
import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import { saveRoomFiltersInputSchema } from "@/lib/room-filters/room-filter-input";
import { DrizzleRoomFilterRepository } from "@/lib/room-filters/room-filter-repository";
import { RoomFilterService } from "@/lib/room-filters/room-filter-service";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The filter integration test requires local PostgreSQL in DATABASE_URL.");
}

test("PostgreSQL host filters preserve authorization, atomicity, retries and room isolation", async context => {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleRoomFilterRepository(async () => database);
  const service = new RoomFilterService(repository);
  const code = randomBytes(4).toString("hex").toUpperCase();
  const otherCode = randomBytes(4).toString("hex").toUpperCase();
  const createdRooms = await database
    .insert(rooms)
    .values([{ code }, { code: otherCode }])
    .returning();
  const room = createdRooms.find(row => row.code === code);
  const otherRoom = createdRooms.find(row => row.code === otherCode);
  assert.ok(room && otherRoom);
  const createdGenres = await database
    .insert(genres)
    .values([{ name: `Comedy ${code}` }, { name: `Drama ${code}` }])
    .returning();
  const genreIds = createdGenres.map(genre => genre.id).sort((a, b) => a - b);
  const host = generateParticipantAccessToken();
  const guest = generateParticipantAccessToken();
  const otherHost = generateParticipantAccessToken();
  context.after(async () => {
    await database.delete(rooms).where(
      inArray(
        rooms.id,
        createdRooms.map(row => row.id),
      ),
    );
    await database.delete(genres).where(inArray(genres.id, genreIds));
    await client.end();
  });
  await database.insert(participants).values([
    { roomId: room.id, name: "Host", role: "host", accessTokenHash: hashParticipantAccessToken(host) },
    { roomId: room.id, name: "Guest", role: "guest", accessTokenHash: hashParticipantAccessToken(guest) },
    { roomId: otherRoom.id, name: "Other host", role: "host", accessTokenHash: hashParticipantAccessToken(otherHost) },
  ]);
  const defaults: RoomFilterValues = { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [] };
  const first = saveRoomFiltersInputSchema.parse({
    roomCode: code,
    requestId: randomUUID(),
    filters: { ...defaults, netflixOnly: true, yearFilter: "new", genreIds: [...genreIds, ...genreIds] },
  });

  await context.test("authorizes the stored room-scoped host and rejects forged inputs", async () => {
    for (const token of [null, "bad", guest, otherHost]) {
      assert.deepEqual(await service.read(code, token), { status: "unavailable" });
      assert.deepEqual(await service.save(first, token), { status: "unavailable" });
    }
    const initial = await service.read(code, host);
    assert.equal(initial.status, "ready");
    assert.deepEqual(initial.snapshot.filters, defaults);
    assert.deepEqual(Object.keys(initial.snapshot).sort(), ["filters", "genres"]);
    assert.ok(initial.snapshot.genres.every(genre => Object.keys(genre).sort().join() === "id,name"));
  });

  await context.test("concurrent duplicate requests commit once; an old retry cannot revert a newer save", async () => {
    const results = await Promise.all([service.save(first, host), service.save(first, host)]);
    assert.deepEqual(results, [
      { status: "saved", filters: first.filters },
      { status: "saved", filters: first.filters },
    ]);
    assert.equal((await database.select().from(roomFilterSaves).where(eq(roomFilterSaves.roomId, room.id))).length, 1);
    assert.equal((await database.select().from(roomGenres).where(eq(roomGenres.roomId, room.id))).length, 2);
    const second = { roomCode: code, requestId: randomUUID(), filters: { ...defaults, underTwoHours: true, yearFilter: "old" as const } };
    await service.save(second, host);
    assert.deepEqual(await service.save(first, host), { status: "saved", filters: second.filters });
    assert.deepEqual(await service.save({ ...first, filters: defaults }, host), { status: "conflict" });
    assert.deepEqual(await database.select().from(roomGenres).where(eq(roomGenres.roomId, room.id)), []);
    const [current] = await database.select().from(rooms).where(eq(rooms.id, room.id));
    assert.ok(current);
    assert.equal(current.status, room.status);
    assert.deepEqual(current.expiresAt, room.expiresAt);
    const other = await service.read(otherCode, otherHost);
    assert.equal(other.status, "ready");
    assert.deepEqual(other.snapshot.filters, defaults);
  });

  await context.test("concurrent different saves keep scalar fields and genre sets from the same command", async () => {
    const a = { ...first, requestId: randomUUID() };
    const b = { ...first, requestId: randomUUID(), filters: { ...defaults, underTwoHours: true, genreIds: genreIds.slice(0, 1) } };
    await Promise.all([service.save(a, host), service.save(b, host)]);
    const current = await service.read(code, host);
    assert.equal(current.status, "ready");
    assert.ok([a.filters, b.filters].some(filters => JSON.stringify(filters) === JSON.stringify(current.snapshot.filters)));
    assert.deepEqual(await service.save(a, host), { status: "saved", filters: current.snapshot.filters });
    assert.deepEqual(await service.save(b, host), { status: "saved", filters: current.snapshot.filters });
  });

  await context.test("unknown genres and transaction failures leave filters and command receipts intact", async () => {
    const before = await service.read(code, host);
    const receipts = await database.select().from(roomFilterSaves).where(eq(roomFilterSaves.roomId, room.id));
    const bad = { ...first, requestId: randomUUID(), filters: { ...defaults, genreIds: [2147483647] } };
    assert.deepEqual(await service.save(bad, host), { status: "validation_error" });
    await assert.rejects(
      repository.inLockedRoom(code, async (_room, locked) => {
        await locked.saveFilters(bad, "a".repeat(64));
      }),
    );
    await assert.rejects(
      repository.inLockedRoom(code, async (_room, locked) => {
        await locked.saveFilters({ ...first, requestId: randomUUID() }, "b".repeat(64));
        throw new Error("Simulated failure after saving the receipt");
      }),
    );
    assert.deepEqual(await service.read(code, host), before);
    assert.deepEqual(await database.select().from(roomFilterSaves).where(eq(roomFilterSaves.roomId, room.id)), receipts);
  });

  await context.test("rejects unavailable rooms under lock, including elapsed expiration", async () => {
    const request = { ...first, requestId: randomUUID() };
    for (const status of ["playing", "matched", "exhausted", "closed"] as const) {
      await database.update(rooms).set({ status }).where(eq(rooms.id, room.id));
      assert.deepEqual(await service.save(request, host), { status: "unavailable" });
    }
    const expiredAt = new Date(Date.now() - 3600000);
    await database
      .update(rooms)
      .set({ status: "waiting", createdAt: new Date(expiredAt.getTime() - 3600000), expiresAt: expiredAt })
      .where(eq(rooms.id, room.id));
    assert.deepEqual(await service.save(request, host), { status: "unavailable" });
    assert.deepEqual(await service.save({ ...request, roomCode: "MISSING" }, host), { status: "unavailable" });
  });

  await context.test("receipts have RLS, no browser privileges, and cascade with their room", async () => {
    const security = await database.execute<{ rls: boolean; can_read: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(sql`
      select relrowsecurity as rls,
        has_table_privilege(role, 'public.room_filter_saves', 'SELECT') as can_read,
        has_table_privilege(role, 'public.room_filter_saves', 'INSERT') as can_insert,
        has_table_privilege(role, 'public.room_filter_saves', 'UPDATE') as can_update,
        has_table_privilege(role, 'public.room_filter_saves', 'DELETE') as can_delete
      from pg_class cross join (values ('anon'), ('authenticated')) roles(role)
      where oid = 'public.room_filter_saves'::regclass`);
    assert.equal(security.length, 2);
    for (const row of security) assert.deepEqual(row, { rls: true, can_read: false, can_insert: false, can_update: false, can_delete: false });
    await database.delete(rooms).where(eq(rooms.id, room.id));
    assert.deepEqual(await database.select().from(roomFilterSaves).where(eq(roomFilterSaves.roomId, room.id)), []);
    assert.equal((await database.select().from(genres).where(inArray(genres.id, genreIds))).length, 2);
  });
});
