import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { DrizzleRoomCleanupRepository, ROOM_CLEANUP_BATCH_SIZE } from "@/lib/room-cleanup/room-cleanup-repository";
import { DrizzleParticipantRepository } from "@/lib/participants/participant-repository";
import { ParticipantService, type JoinParticipantResult } from "@/lib/participants/participant-service";
import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import type { RoomStatus } from "@/lib/rooms/room-service";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Cleanup integration requires an isolated local PostgreSQL DATABASE_URL; all expired fixtures may be removed.");
}

test("PostgreSQL cleanup is bounded, atomic, concurrent, cascade complete, and independent from command expiry", async context => {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleRoomCleanupRepository(async () => database);
  const roomIds: string[] = [];
  const [genre] = await database
    .insert(schema.genres)
    .values({ name: `Cleanup ${randomUUID()}` })
    .returning();
  const [movie] = await database.insert(schema.movies).values({ title: "Cleanup catalog", releaseYear: 2020, runtimeMinutes: 90 }).returning();
  assert.ok(genre && movie);
  await database.insert(schema.movieGenres).values({ movieId: movie.id, genreId: genre.id });
  context.after(async () => {
    await database.delete(schema.rooms).where(inArray(schema.rooms.id, roomIds));
    await database.delete(schema.movies).where(eq(schema.movies.id, movie.id));
    await database.delete(schema.genres).where(eq(schema.genres.id, genre.id));
    await client.end();
  });

  async function createRoom(status: RoomStatus, expired = true): Promise<typeof schema.rooms.$inferSelect> {
    const [room] = await database
      .insert(schema.rooms)
      .values({
        code: randomBytes(4).toString("hex").toUpperCase(),
        status,
        createdAt: sql`statement_timestamp() - ${expired ? "2 hours" : "0 hours"}::interval`,
        expiresAt: sql`statement_timestamp() - ${expired ? "1 hour" : "-1 hour"}::interval`,
      })
      .returning();
    assert.ok(room);
    roomIds.push(room.id);
    assert.equal(room.expiresAt.getTime() - room.createdAt.getTime(), 3_600_000);
    return room;
  }

  await context.test("all room-owned rows cascade for every room status while live rooms and shared catalog remain", async () => {
    const live = await createRoom("waiting", false);
    for (const status of ["waiting", "playing", "matched", "exhausted", "closed"] as const) {
      const room = await createRoom(status);
      const roomId = room.id;
      const [participant] = await database
        .insert(schema.participants)
        .values({ roomId, name: "Cleanup", role: "host", accessTokenHash: hashParticipantAccessToken(generateParticipantAccessToken()) })
        .returning();
      const [round] = await database.insert(schema.rounds).values({ roomId, roundNumber: 1, status: "no_match" }).returning();
      assert.ok(participant && round);
      const roundId = round.id;
      const participantId = participant.id;
      const payloadHash = "a".repeat(64);
      await database.insert(schema.roomGenres).values({ roomId, genreId: genre.id });
      await database.insert(schema.roomFilterSaves).values({ roomId, requestId: randomUUID(), payloadHash });
      await database.insert(schema.roomGameCommands).values({ roomId, requestId: randomUUID(), payloadHash, command: "start", outcome: "started" });
      await database.insert(schema.roundMovies).values({ roomId, roundId, movieId: movie.id, position: 1 });
      await database.insert(schema.votes).values({ roomId, roundId, participantId, movieId: movie.id, value: "no" });
      await database.insert(schema.roundBallots).values({ roomId, roundId, participantId, requestId: randomUUID(), payloadHash });
      await database
        .insert(schema.noMatchRoundReadiness)
        .values({ roomId, roundId, participantId, requestId: randomUUID(), payloadHash, outcome: "ready" });
    }
    assert.equal(await repository.deleteExpiredBatch(), 5);
    assert.equal(await repository.deleteExpiredBatch(), 0);
    for (const table of [
      schema.participants,
      schema.roomGenres,
      schema.roomFilterSaves,
      schema.roomGameCommands,
      schema.rounds,
      schema.roundMovies,
      schema.votes,
      schema.roundBallots,
      schema.noMatchRoundReadiness,
    ]) {
      assert.equal((await database.select().from(table).where(inArray(table.roomId, roomIds))).length, 0);
    }
    assert.equal((await database.select().from(schema.rooms).where(eq(schema.rooms.id, live.id))).length, 1);
    assert.equal((await database.select().from(schema.movies).where(eq(schema.movies.id, movie.id))).length, 1);
    assert.equal((await database.select().from(schema.genres).where(eq(schema.genres.id, genre.id))).length, 1);
    assert.equal((await database.select().from(schema.movieGenres).where(eq(schema.movieGenres.movieId, movie.id))).length, 1);
  });

  await context.test("a large backlog is bounded and overlapping runs delete each row once", async () => {
    for (let index = 0; index < ROOM_CLEANUP_BATCH_SIZE + 3; index += 1) {
      await createRoom("closed");
    }
    const counts = await Promise.all([repository.deleteExpiredBatch(), repository.deleteExpiredBatch()]);
    assert.ok(counts.every(count => count <= ROOM_CLEANUP_BATCH_SIZE));
    assert.equal(
      counts.reduce((sum, count) => sum + count, 0),
      ROOM_CLEANUP_BATCH_SIZE + 3,
    );
    assert.equal(await repository.deleteExpiredBatch(), 0);
  });

  await context.test("a database failure rolls back the batch and the next attempt resumes", async () => {
    const room = await createRoom("matched");
    await database.execute(
      sql`create function public.task016_fail_cleanup() returns trigger language plpgsql as $$ begin raise exception 'controlled cleanup failure'; end $$`,
    );
    await database.execute(
      sql`create trigger task016_fail_cleanup before delete on rooms for each row execute function public.task016_fail_cleanup()`,
    );
    try {
      await assert.rejects(repository.deleteExpiredBatch());
      assert.equal((await database.select().from(schema.rooms).where(eq(schema.rooms.id, room.id))).length, 1);
    } finally {
      await database.execute(sql`drop trigger task016_fail_cleanup on rooms`);
      await database.execute(sql`drop function public.task016_fail_cleanup()`);
    }
    assert.equal(await repository.deleteExpiredBatch(), 1);
  });

  await context.test("cleanup skips a room-command lock while expired commands remain unavailable", async () => {
    const room = await createRoom("waiting");
    let command: Promise<JoinParticipantResult> | null = null;
    await database.transaction(async transaction => {
      await transaction.select().from(schema.rooms).where(eq(schema.rooms.id, room.id)).for("update");
      assert.equal(await repository.deleteExpiredBatch(), 0);
      const service = new ParticipantService(new DrizzleParticipantRepository(async () => database));
      command = service.joinParticipant({ roomCode: room.code, name: "Late", joinRequestToken: generateParticipantAccessToken() }, null);
    });
    assert.ok(command);
    assert.deepEqual(await command, { status: "unavailable" });
    assert.equal(await repository.deleteExpiredBatch(), 1);
    assert.equal((await database.select().from(schema.participants).where(eq(schema.participants.roomId, room.id))).length, 0);
  });
});
