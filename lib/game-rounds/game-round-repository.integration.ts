import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { genres, movieGenres, movies, participants, roomGameCommands, roomGenres, rooms, roundMovies, rounds, votes } from "@/lib/db/schema";
import { DrizzleGameRoundRepository } from "@/lib/game-rounds/game-round-repository";
import { GameRoundService } from "@/lib/game-rounds/game-round-service";
import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import { DrizzleParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-repository";
import { createParticipantRealtimeTopic, ParticipantSnapshotService } from "@/lib/participants/participant-snapshot-service";
import { DrizzleRoomFilterRepository } from "@/lib/room-filters/room-filter-repository";
import { RoomFilterService } from "@/lib/room-filters/room-filter-service";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The game-round integration test requires local PostgreSQL in DATABASE_URL.");
}

type TestRoom = {
  id: string;
  code: string;
  hostToken: string;
  guestToken: string | null;
  hostId: string;
  guestId: string | null;
  expiresAt: Date;
};

test("PostgreSQL game rounds preserve atomic generation, idempotency, filters, and restart isolation", async context => {
  const client = postgres(databaseUrl, { max: 20, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleGameRoundRepository(async () => database);
  const service = new GameRoundService(repository);
  const filterService = new RoomFilterService(new DrizzleRoomFilterRepository(async () => database));
  const snapshotService = new ParticipantSnapshotService(new DrizzleParticipantSnapshotRepository(async () => database));
  const roomIds: string[] = [];
  const genreRows = await database
    .insert(genres)
    .values([
      { name: `Action ${randomUUID()}` },
      { name: `Comedy ${randomUUID()}` },
      { name: `Drama ${randomUUID()}` },
      { name: `Zero ${randomUUID()}` },
      { name: `One ${randomUUID()}` },
      { name: `Two ${randomUUID()}` },
      { name: `Three ${randomUUID()}` },
    ])
    .returning();
  const [actionGenre, comedyGenre, dramaGenre, zeroGenre, oneGenre, twoGenre, threeGenre] = genreRows;
  assert.ok(actionGenre && comedyGenre && dramaGenre && zeroGenre && oneGenre && twoGenre && threeGenre);
  const movieRows = await database
    .insert(movies)
    .values([
      { title: `Eligible A ${randomUUID()}`, releaseYear: 2011, runtimeMinutes: 119, availableOnNetflix: true },
      { title: `Eligible B ${randomUUID()}`, releaseYear: 2012, runtimeMinutes: 100, availableOnNetflix: true },
      { title: `Eligible C ${randomUUID()}`, releaseYear: 2020, runtimeMinutes: 90, availableOnNetflix: true },
      { title: `Old boundary ${randomUUID()}`, releaseYear: 2010, runtimeMinutes: 100, availableOnNetflix: true },
      { title: `Runtime boundary ${randomUUID()}`, releaseYear: 2015, runtimeMinutes: 120, availableOnNetflix: true },
      { title: `Netflix boundary ${randomUUID()}`, releaseYear: 2015, runtimeMinutes: 90, availableOnNetflix: false },
      { title: `Genre boundary ${randomUUID()}`, releaseYear: 2015, runtimeMinutes: 90, availableOnNetflix: true },
      { title: `Old second ${randomUUID()}`, releaseYear: 2005, runtimeMinutes: 130, availableOnNetflix: false },
      { title: `Old third ${randomUUID()}`, releaseYear: 1999, runtimeMinutes: 95, availableOnNetflix: false },
    ])
    .returning();
  assert.equal(movieRows.length, 9);
  const [eligibleA, eligibleB, eligibleC, oldBoundary, runtimeBoundary, netflixBoundary, genreBoundary, oldSecond, oldThird] = movieRows;
  assert.ok(eligibleA && eligibleB && eligibleC && oldBoundary && runtimeBoundary && netflixBoundary && genreBoundary && oldSecond && oldThird);
  await database.insert(movieGenres).values([
    { movieId: eligibleA.id, genreId: actionGenre.id },
    { movieId: eligibleA.id, genreId: comedyGenre.id },
    { movieId: eligibleB.id, genreId: comedyGenre.id },
    { movieId: eligibleC.id, genreId: actionGenre.id },
    { movieId: oldBoundary.id, genreId: actionGenre.id },
    { movieId: oldBoundary.id, genreId: dramaGenre.id },
    { movieId: runtimeBoundary.id, genreId: actionGenre.id },
    { movieId: netflixBoundary.id, genreId: actionGenre.id },
    { movieId: genreBoundary.id, genreId: dramaGenre.id },
    { movieId: oldSecond.id, genreId: dramaGenre.id },
    { movieId: oldThird.id, genreId: comedyGenre.id },
    { movieId: oldThird.id, genreId: dramaGenre.id },
    { movieId: eligibleA.id, genreId: oneGenre.id },
    { movieId: eligibleA.id, genreId: twoGenre.id },
    { movieId: eligibleB.id, genreId: twoGenre.id },
    { movieId: eligibleA.id, genreId: threeGenre.id },
    { movieId: eligibleB.id, genreId: threeGenre.id },
    { movieId: eligibleC.id, genreId: threeGenre.id },
  ]);

  context.after(async () => {
    await database.delete(rooms).where(inArray(rooms.id, roomIds));
    await database.delete(movies).where(
      inArray(
        movies.id,
        movieRows.map(movie => movie.id),
      ),
    );
    await database.delete(genres).where(
      inArray(
        genres.id,
        genreRows.map(genre => genre.id),
      ),
    );
    await client.end();
  });

  async function createRoom(
    options: {
      guest?: boolean;
      status?: "waiting" | "playing" | "matched" | "exhausted" | "closed";
      exhaustionReason?: "catalog_insufficient" | "list_exhausted";
    } = {},
  ): Promise<TestRoom> {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const roomRows = await database
      .insert(rooms)
      .values({
        code,
        status: options.status ?? "waiting",
        exhaustionReason: options.status === "exhausted" ? (options.exhaustionReason ?? "list_exhausted") : null,
      })
      .returning({ id: rooms.id, expiresAt: rooms.expiresAt });
    const room = roomRows.at(0);
    assert.ok(room);
    roomIds.push(room.id);
    const hostToken = generateParticipantAccessToken();
    const guestToken = options.guest === false ? null : generateParticipantAccessToken();
    const insertedParticipants = await database
      .insert(participants)
      .values([
        { roomId: room.id, role: "host", name: "Host", accessTokenHash: hashParticipantAccessToken(hostToken) },
        ...(guestToken === null
          ? []
          : [{ roomId: room.id, role: "guest" as const, name: "Guest", accessTokenHash: hashParticipantAccessToken(guestToken) }]),
      ])
      .returning({ id: participants.id, role: participants.role });
    const host = insertedParticipants.find(participant => participant.role === "host");
    const guest = insertedParticipants.find(participant => participant.role === "guest") ?? null;
    assert.ok(host);

    return { id: room.id, code, hostToken, guestToken, hostId: host.id, guestId: guest?.id ?? null, expiresAt: room.expiresAt };
  }

  async function setFilters(roomId: string, filters: RoomFilterValues): Promise<void> {
    await database
      .update(rooms)
      .set({ netflixOnly: filters.netflixOnly, underTwoHours: filters.underTwoHours, yearFilter: filters.yearFilter })
      .where(eq(rooms.id, roomId));
    await database.delete(roomGenres).where(eq(roomGenres.roomId, roomId));
    if (filters.genreIds.length > 0) {
      await database.insert(roomGenres).values(filters.genreIds.map(genreId => ({ roomId, genreId })));
    }
  }

  async function createHistoricalRound(room: TestRoom, movieIds: number[], roundNumber = 1): Promise<string> {
    const roundRows = await database.insert(rounds).values({ roomId: room.id, roundNumber, status: "no_match" }).returning({ id: rounds.id });
    const round = roundRows.at(0);
    assert.ok(round);
    await database
      .insert(roundMovies)
      .values(movieIds.map((movieId, index) => ({ roomId: room.id, roundId: round.id, movieId, position: index + 1 })));
    return round.id;
  }

  await context.test("enforces host, participant-count, state, and expiration guards without writes", async () => {
    const room = await createRoom();
    assert.deepEqual(await service.start({ roomCode: room.code, requestId: randomUUID() }, room.guestToken), { status: "unavailable" });
    assert.deepEqual(await service.start({ roomCode: room.code, requestId: randomUUID() }, generateParticipantAccessToken()), {
      status: "unavailable",
    });
    const oneParticipant = await createRoom({ guest: false });
    assert.deepEqual(await service.start({ roomCode: oneParticipant.code, requestId: randomUUID() }, oneParticipant.hostToken), {
      status: "unavailable",
    });
    const playing = await createRoom({ status: "playing" });
    assert.deepEqual(await service.start({ roomCode: playing.code, requestId: randomUUID() }, playing.hostToken), { status: "unavailable" });
    const expired = await createRoom();
    const expiresAt = new Date(Date.now() - 60_000);
    await database
      .update(rooms)
      .set({ createdAt: new Date(expiresAt.getTime() - 3_600_000), expiresAt })
      .where(eq(rooms.id, expired.id));
    assert.deepEqual(await service.start({ roomCode: expired.code, requestId: randomUUID() }, expired.hostToken), { status: "unavailable" });

    for (const candidate of [room, oneParticipant, playing, expired]) {
      assert.equal((await database.select().from(rounds).where(eq(rounds.roomId, candidate.id))).length, 0);
      assert.equal((await database.select().from(roomGameCommands).where(eq(roomGameCommands.roomId, candidate.id))).length, 0);
    }
  });

  await context.test("applies AND filters, OR genres, exact boundaries, and multi-genre deduplication", async () => {
    const room = await createRoom();
    await setFilters(room.id, {
      netflixOnly: true,
      underTwoHours: true,
      yearFilter: "new",
      genreIds: [actionGenre.id, comedyGenre.id],
    });
    const result = await service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken);
    assert.equal(result.status, "completed");
    assert.equal(result.outcome, "started");
    const selected = await database.select({ movieId: roundMovies.movieId }).from(roundMovies).where(eq(roundMovies.roomId, room.id));
    assert.deepEqual(new Set(selected.map(row => row.movieId)), new Set([eligibleA.id, eligibleB.id, eligibleC.id]));
    assert.equal(selected.length, 3);

    const oldRoom = await createRoom();
    await setFilters(oldRoom.id, { netflixOnly: false, underTwoHours: false, yearFilter: "old", genreIds: [dramaGenre.id] });
    const oldCandidates = await repository.inLockedRoom(oldRoom.code, async (_lockedRoom, locked) =>
      locked.selectEligibleMovieIds({ netflixOnly: false, underTwoHours: false, yearFilter: "old", genreIds: [dramaGenre.id] }, false),
    );
    assert.deepEqual(new Set(oldCandidates), new Set([oldBoundary.id, oldSecond.id, oldThird.id]));
  });

  await context.test("serializes concurrent starts and replays a committed response without a second round", async () => {
    const sameRequestRoom = await createRoom();
    const input = { roomCode: sameRequestRoom.code, requestId: randomUUID() };
    const sameResults = await Promise.all([service.start(input, sameRequestRoom.hostToken), service.start(input, sameRequestRoom.hostToken)]);
    assert.ok(sameResults.every(result => result.status === "completed" && result.outcome === "started"));
    assert.equal((await database.select().from(rounds).where(eq(rounds.roomId, sameRequestRoom.id))).length, 1);
    assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roomId, sameRequestRoom.id))).length, 3);
    assert.equal((await database.select().from(roomGameCommands).where(eq(roomGameCommands.roomId, sameRequestRoom.id))).length, 1);

    const differentRequestRoom = await createRoom();
    const differentResults = await Promise.all([
      service.start({ roomCode: differentRequestRoom.code, requestId: randomUUID() }, differentRequestRoom.hostToken),
      service.start({ roomCode: differentRequestRoom.code, requestId: randomUUID() }, differentRequestRoom.hostToken),
    ]);
    assert.equal(differentResults.filter(result => result.status === "completed").length, 1);
    assert.equal(differentResults.filter(result => result.status === "unavailable").length, 1);
    assert.equal((await database.select().from(rounds).where(eq(rounds.roomId, differentRequestRoom.id))).length, 1);
  });

  await context.test("serializes filter save and start on one complete persisted filter set", async () => {
    const room = await createRoom();
    const savedFilters: RoomFilterValues = {
      netflixOnly: true,
      underTwoHours: true,
      yearFilter: "new",
      genreIds: [actionGenre.id, comedyGenre.id],
    };
    const [saveResult, startResult] = await Promise.all([
      filterService.save({ roomCode: room.code, requestId: randomUUID(), filters: savedFilters }, room.hostToken),
      service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken),
    ]);
    assert.equal(startResult.status, "completed");
    const persistedRoom = (await database.select().from(rooms).where(eq(rooms.id, room.id))).at(0);
    assert.ok(persistedRoom);
    const persistedGenres = await database.select({ genreId: roomGenres.genreId }).from(roomGenres).where(eq(roomGenres.roomId, room.id));
    const selected = await database.select({ movieId: roundMovies.movieId }).from(roundMovies).where(eq(roundMovies.roomId, room.id));

    if (saveResult.status === "saved") {
      assert.equal(persistedRoom.netflixOnly, true);
      assert.equal(persistedRoom.underTwoHours, true);
      assert.equal(persistedRoom.yearFilter, "new");
      assert.deepEqual(new Set(persistedGenres.map(row => row.genreId)), new Set(savedFilters.genreIds));
      assert.deepEqual(new Set(selected.map(row => row.movieId)), new Set([eligibleA.id, eligibleB.id, eligibleC.id]));
    } else {
      assert.deepEqual(saveResult, { status: "unavailable" });
      assert.equal(persistedRoom.netflixOnly, false);
      assert.equal(persistedRoom.underTwoHours, false);
      assert.equal(persistedRoom.yearFilter, "any");
      assert.deepEqual(persistedGenres, []);
      assert.equal(selected.length, 3);
    }
  });

  await context.test("excludes every movie in room history and advances the persisted round number", async () => {
    const room = await createRoom();
    const seenIds = [eligibleA.id, eligibleB.id, eligibleC.id];
    await createHistoricalRound(room, seenIds);
    const result = await service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken);
    assert.equal(result.status, "completed");
    const roundRows = await database.select().from(rounds).where(eq(rounds.roomId, room.id));
    assert.deepEqual(new Set(roundRows.map(round => round.roundNumber)), new Set([1, 2]));
    const newRound = roundRows.find(round => round.roundNumber === 2);
    assert.ok(newRound);
    const selected = await database.select({ movieId: roundMovies.movieId }).from(roundMovies).where(eq(roundMovies.roundId, newRound.id));
    assert.equal(selected.length, 3);
    assert.ok(selected.every(row => !seenIds.includes(row.movieId)));
  });

  await context.test("handles exactly zero, one, two, and three candidates without partial rounds", async () => {
    const cases = [
      { genreId: zeroGenre.id, expected: 0 },
      { genreId: oneGenre.id, expected: 1 },
      { genreId: twoGenre.id, expected: 2 },
      { genreId: threeGenre.id, expected: 3 },
    ];

    for (const candidateCase of cases) {
      const room = await createRoom();
      await setFilters(room.id, { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [candidateCase.genreId] });
      const result = await service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken);
      assert.equal(result.status, "completed");
      assert.equal(result.outcome, candidateCase.expected === 3 ? "started" : "catalog_insufficient");
      assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roomId, room.id))).length, candidateCase.expected === 3 ? 3 : 0);
      const roomState = await database
        .select({ status: rooms.status, exhaustionReason: rooms.exhaustionReason })
        .from(rooms)
        .where(eq(rooms.id, room.id));
      assert.equal(roomState.at(0)?.status, candidateCase.expected === 3 ? "playing" : "exhausted");
      assert.equal(roomState.at(0)?.exhaustionReason, candidateCase.expected === 3 ? null : "catalog_insufficient");
    }
  });

  await context.test("rolls back the room and round when movie-position insertion fails", async () => {
    const room = await createRoom();
    await assert.rejects(
      repository.inLockedRoom(room.code, async (_lockedRoom, locked) => {
        await locked.setRoomStatus("playing", null);
        await locked.createRound(1, [eligibleA.id, eligibleB.id, 2_147_483_647]);
      }),
    );
    assert.equal((await database.select().from(rounds).where(eq(rounds.roomId, room.id))).length, 0);
    assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roomId, room.id))).length, 0);
    assert.equal((await database.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, room.id))).at(0)?.status, "waiting");
  });

  await context.test("restart verifies candidates before cascading only its own history and safely replays", async () => {
    const room = await createRoom({ status: "exhausted", exhaustionReason: "list_exhausted" });
    const oldRoundId = await createHistoricalRound(room, [eligibleA.id, eligibleB.id, eligibleC.id], 4);
    assert.ok(room.guestId);
    await database.insert(votes).values({
      roomId: room.id,
      roundId: oldRoundId,
      participantId: room.hostId,
      movieId: eligibleA.id,
      value: "could_watch",
    });
    const otherRoom = await createRoom({ status: "exhausted", exhaustionReason: "list_exhausted" });
    const otherRoundId = await createHistoricalRound(otherRoom, [oldBoundary.id, oldSecond.id, oldThird.id], 2);
    const originalParticipants = await database.select().from(participants).where(eq(participants.roomId, room.id));
    const input = { roomCode: room.code, requestId: randomUUID() };

    assert.equal((await service.restart(input, room.hostToken)).status, "completed");
    assert.equal((await database.select().from(rounds).where(eq(rounds.id, oldRoundId))).length, 0);
    assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roundId, oldRoundId))).length, 0);
    assert.equal((await database.select().from(votes).where(eq(votes.roundId, oldRoundId))).length, 0);
    const newRounds = await database.select().from(rounds).where(eq(rounds.roomId, room.id));
    assert.equal(newRounds.length, 1);
    assert.equal(newRounds.at(0)?.roundNumber, 1);
    assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roomId, room.id))).length, 3);
    assert.deepEqual(await database.select().from(participants).where(eq(participants.roomId, room.id)), originalParticipants);
    assert.equal(
      (await database.select({ expiresAt: rooms.expiresAt }).from(rooms).where(eq(rooms.id, room.id))).at(0)?.expiresAt.getTime(),
      room.expiresAt.getTime(),
    );
    assert.equal((await database.select().from(rounds).where(eq(rounds.id, otherRoundId))).length, 1);

    await service.restart(input, room.hostToken);
    assert.equal((await database.select().from(rounds).where(eq(rounds.roomId, room.id))).length, 1);
  });

  await context.test("an insufficient restart keeps prior history and reaches a terminal idempotent outcome", async () => {
    const room = await createRoom({ status: "exhausted", exhaustionReason: "list_exhausted" });
    const oldRoundId = await createHistoricalRound(room, [eligibleA.id, eligibleB.id, eligibleC.id]);
    await setFilters(room.id, { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [twoGenre.id] });
    const input = { roomCode: room.code, requestId: randomUUID() };
    const result = await service.restart(input, room.hostToken);
    assert.equal(result.status === "completed" ? result.outcome : null, "catalog_insufficient");
    assert.equal((await database.select().from(rounds).where(eq(rounds.id, oldRoundId))).length, 1);
    assert.equal((await database.select().from(roundMovies).where(eq(roundMovies.roundId, oldRoundId))).length, 3);
    await service.restart(input, room.hostToken);
    assert.equal((await database.select().from(rounds).where(eq(rounds.id, oldRoundId))).length, 1);
  });

  await context.test("returns one ordered public round snapshot without credentials or receipt fields", async () => {
    const room = await createRoom();
    await setFilters(room.id, { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [threeGenre.id] });
    await service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken);
    const snapshot = await snapshotService.getSnapshotForTopic(createParticipantRealtimeTopic(room.id));
    assert.ok(snapshot?.currentRound);
    assert.equal(snapshot.roomState, "playing");
    assert.equal(snapshot.currentRound.roundNumber, 1);
    assert.equal(snapshot.currentRound.status, "voting");
    assert.deepEqual(
      snapshot.currentRound.movies.map(movie => movie.position),
      [1, 2, 3],
    );
    assert.deepEqual(new Set(snapshot.currentRound.movies.map(movie => movie.movieId)), new Set([eligibleA.id, eligibleB.id, eligibleC.id]));
    for (const movie of snapshot.currentRound.movies) {
      assert.deepEqual(Object.keys(movie).sort(), ["genres", "movieId", "position", "posterPath", "releaseYear", "runtimeMinutes", "title"]);
    }
    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes(room.hostToken), false);
    assert.equal(serialized.includes(hashParticipantAccessToken(room.hostToken)), false);
    assert.equal(serialized.includes("payloadHash"), false);
    assert.equal(serialized.includes("requestId"), false);
  });

  await context.test("keeps game-command receipts server-only and cascades them with the room", async () => {
    const security = await database.execute<{ rls: boolean; can_read: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(sql`
      select relrowsecurity as rls,
        has_table_privilege(role, 'public.room_game_commands', 'SELECT') as can_read,
        has_table_privilege(role, 'public.room_game_commands', 'INSERT') as can_insert,
        has_table_privilege(role, 'public.room_game_commands', 'UPDATE') as can_update,
        has_table_privilege(role, 'public.room_game_commands', 'DELETE') as can_delete
      from pg_class cross join (values ('anon'), ('authenticated')) roles(role)
      where oid = 'public.room_game_commands'::regclass`);
    assert.equal(security.length, 2);
    for (const row of security) {
      assert.deepEqual(row, { rls: true, can_read: false, can_insert: false, can_update: false, can_delete: false });
    }

    const room = await createRoom();
    await service.start({ roomCode: room.code, requestId: randomUUID() }, room.hostToken);
    assert.equal((await database.select().from(roomGameCommands).where(eq(roomGameCommands.roomId, room.id))).length, 1);
    await database.delete(rooms).where(eq(rooms.id, room.id));
    assert.equal((await database.select().from(roomGameCommands).where(eq(roomGameCommands.roomId, room.id))).length, 0);
  });
});
