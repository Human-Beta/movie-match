import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { DrizzleRoomCleanupRepository } from "@/lib/room-cleanup/room-cleanup-repository";
import { RoomCreationRequestUnavailableError } from "@/lib/rooms/errors";
import { DrizzleRoomRepository } from "@/lib/rooms/room-repository";
import { RoomService } from "@/lib/rooms/room-service";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Room creation integration requires an isolated local PostgreSQL DATABASE_URL.");
}

test("PostgreSQL room creation keys survive cleanup and commit atomically", async context => {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleRoomRepository(async () => database);
  const cleanup = new DrizzleRoomCleanupRepository(async () => database);
  const requestIds: string[] = [];
  const codes: string[] = [];
  function requestId(): string {
    const id = randomUUID();
    requestIds.push(id);
    return id;
  }
  function code(): string {
    const value = randomBytes(4).toString("hex").toUpperCase();
    codes.push(value);
    return value;
  }
  context.after(async () => {
    await database.delete(schema.rooms).where(inArray(schema.rooms.code, codes));
    await database.delete(schema.roomCreationRequests).where(inArray(schema.roomCreationRequests.requestId, requestIds));
    await client.end();
  });

  await context.test("concurrent lost-response retries restore one room and one durable key", async () => {
    const key = requestId();
    const service = new RoomService(repository, { generateCode: code });
    const snapshots = await Promise.all(Array.from({ length: 12 }, () => service.resolveOrCreateRoom(null, key)));
    assert.equal(new Set(snapshots.map(room => room.code)).size, 1);
    assert.equal((await database.select().from(schema.rooms).where(eq(schema.rooms.creationRequestId, key))).length, 1);
    assert.equal((await database.select().from(schema.roomCreationRequests).where(eq(schema.roomCreationRequests.requestId, key))).length, 1);
    assert.deepEqual(await repository.findByCreationRequestId(key), snapshots[0]);
  });

  await context.test("expired creation requests remain terminal after physical cleanup and direct retries roll back", async () => {
    const key = requestId();
    const service = new RoomService(repository, { generateCode: code });
    const room = await service.resolveOrCreateRoom(null, key);
    await database
      .update(schema.rooms)
      .set({
        createdAt: sql`statement_timestamp() - interval '2 hours'`,
        expiresAt: sql`statement_timestamp() - interval '1 hour'`,
      })
      .where(eq(schema.rooms.code, room.code));
    await assert.rejects(service.resolveOrCreateRoom(room.code, key), RoomCreationRequestUnavailableError);
    assert.equal(await cleanup.deleteExpiredBatch(), 1);
    await assert.rejects(repository.findByCreationRequestId(key), RoomCreationRequestUnavailableError);
    await assert.rejects(service.resolveOrCreateRoom(room.code, key), RoomCreationRequestUnavailableError);
    const replayCode = code();
    await assert.rejects(repository.tryCreate(replayCode, key), RoomCreationRequestUnavailableError);
    assert.equal(await repository.findByCode(replayCode), null);
    assert.equal((await database.select().from(schema.rooms).where(eq(schema.rooms.creationRequestId, key))).length, 0);
    assert.equal((await database.select().from(schema.roomCreationRequests).where(eq(schema.roomCreationRequests.requestId, key))).length, 1);
    const fresh = await service.resolveOrCreateRoom(room.code, requestId());
    assert.notEqual(fresh.code, room.code);
  });

  await context.test("a code collision does not consume the new request key", async () => {
    const occupiedCode = code();
    assert.ok(await repository.tryCreate(occupiedCode, requestId()));
    const key = requestId();
    assert.equal(await repository.tryCreate(occupiedCode, key), null);
    assert.equal(await repository.findByCreationRequestId(key), null);
    const nextCode = code();
    assert.equal((await repository.tryCreate(nextCode, key))?.code, nextCode);
  });

  await context.test("browser roles have no read or write privileges on creation keys and RLS is enabled", async () => {
    const rls = await database.execute(sql`select relrowsecurity from pg_class where oid = 'public.room_creation_requests'::regclass`);
    assert.equal(rls[0]?.relrowsecurity, true);
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const result = await database.execute(sql`select has_table_privilege(${role}, 'public.room_creation_requests', ${privilege}) as allowed`);
        assert.equal(result[0]?.allowed, false);
      }
    }
  });
});
