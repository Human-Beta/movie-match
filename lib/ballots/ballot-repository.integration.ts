import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { movies, participants, roundBallots, roundMovies, rounds, rooms, votes } from "@/lib/db/schema";
import { DrizzleBallotRepository } from "@/lib/ballots/ballot-repository";
import { BallotService } from "@/lib/ballots/ballot-service";
import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import { DrizzleParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-repository";
import { ParticipantSnapshotService } from "@/lib/participants/participant-snapshot-service";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The ballot integration test requires local PostgreSQL in DATABASE_URL.");
}

type TestRoom = {
  id: string;
  code: string;
  guestId: string;
  guestToken: string;
  hostId: string;
  hostToken: string;
  movieIds: [number, number, number];
  roundId: string;
};

test("PostgreSQL ballots keep private votes atomic, immutable, and room-scoped", async context => {
  const client = postgres(databaseUrl, { max: 20, prepare: false });
  const database = drizzle(client, { schema });
  const service = new BallotService(new DrizzleBallotRepository(async () => database));
  const snapshotService = new ParticipantSnapshotService(new DrizzleParticipantSnapshotRepository(async () => database));
  const roomIds: string[] = [];
  const movieRows = await database
    .insert(movies)
    .values(
      Array.from({ length: 15 }, (_, index) => ({
        title: `Ballot integration movie ${index} ${randomUUID()}`,
        releaseYear: 2020,
        runtimeMinutes: 100,
      })),
    )
    .returning({ id: movies.id });

  context.after(async () => {
    await database.delete(rooms).where(inArray(rooms.id, roomIds));
    await database.delete(movies).where(
      inArray(
        movies.id,
        movieRows.map(movie => movie.id),
      ),
    );
    await client.end();
  });

  async function createRoom(movieOffset: number): Promise<TestRoom> {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const roomRows = await database.insert(rooms).values({ code, status: "playing" }).returning({ id: rooms.id });
    const room = roomRows.at(0);
    assert.ok(room);
    roomIds.push(room.id);
    const hostToken = generateParticipantAccessToken();
    const guestToken = generateParticipantAccessToken();
    const participantRows = await database
      .insert(participants)
      .values([
        { roomId: room.id, role: "host", name: "Host", accessTokenHash: hashParticipantAccessToken(hostToken) },
        { roomId: room.id, role: "guest", name: "Guest", accessTokenHash: hashParticipantAccessToken(guestToken) },
      ])
      .returning({ id: participants.id, role: participants.role });
    const host = participantRows.find(participant => participant.role === "host");
    const guest = participantRows.find(participant => participant.role === "guest");
    assert.ok(host && guest);
    const roundRows = await database.insert(rounds).values({ roomId: room.id, roundNumber: 1, status: "voting" }).returning({ id: rounds.id });
    const round = roundRows.at(0);
    assert.ok(round);
    const selectedMovieRows = movieRows.slice(movieOffset, movieOffset + 3);
    assert.equal(selectedMovieRows.length, 3);
    const movieIds = selectedMovieRows.map(movie => movie.id) as [number, number, number];
    await database
      .insert(roundMovies)
      .values(movieIds.map((movieId, index) => ({ roomId: room.id, roundId: round.id, movieId, position: index + 1 })));

    return { id: room.id, code, hostId: host.id, hostToken, guestId: guest.id, guestToken, roundId: round.id, movieIds };
  }

  function ballot(
    room: TestRoom,
    requestId = randomUUID(),
    values: readonly [
      "want_to_watch" | "could_watch" | "not_now" | "no",
      "want_to_watch" | "could_watch" | "not_now" | "no",
      "want_to_watch" | "could_watch" | "not_now" | "no",
    ] = ["want_to_watch", "could_watch", "no"],
  ): {
    roomCode: string;
    roundId: string;
    requestId: string;
    votes: { movieId: number; value: (typeof values)[number] }[];
  } {
    return {
      roomCode: room.code,
      roundId: room.roundId,
      requestId,
      votes: room.movieIds.map((movieId, index) => ({ movieId, value: values[index]! })),
    };
  }

  async function createNextVotingRound(room: TestRoom, movieOffset: number): Promise<TestRoom> {
    await database.update(rounds).set({ status: "no_match" }).where(eq(rounds.id, room.roundId));
    const roundRows = await database.insert(rounds).values({ roomId: room.id, roundNumber: 2, status: "voting" }).returning({ id: rounds.id });
    const round = roundRows.at(0);
    assert.ok(round);
    const selectedMovieRows = movieRows.slice(movieOffset, movieOffset + 3);
    assert.equal(selectedMovieRows.length, 3);
    const movieIds = selectedMovieRows.map(movie => movie.id) as [number, number, number];
    await database
      .insert(roundMovies)
      .values(movieIds.map((movieId, index) => ({ roomId: room.id, roundId: round.id, movieId, position: index + 1 })));

    return { ...room, roundId: round.id, movieIds };
  }

  await context.test("commits three votes and one receipt, serializes same-participant retries, and preserves a response-loss replay", async () => {
    const room = await createRoom(0);
    const requestId = randomUUID();
    const submitted = ballot(room, requestId);
    const [first, second] = await Promise.all([service.submit(submitted, room.hostToken), service.submit(submitted, room.hostToken)]);

    assert.equal(first.status, "completed");
    assert.equal(second.status, "completed");
    assert.equal(
      (
        await database
          .select()
          .from(votes)
          .where(and(eq(votes.roomId, room.id), eq(votes.participantId, room.hostId)))
      ).length,
      3,
    );
    assert.equal(
      (
        await database
          .select()
          .from(roundBallots)
          .where(and(eq(roundBallots.roomId, room.id), eq(roundBallots.participantId, room.hostId)))
      ).length,
      1,
    );
    const replay = await service.submit({ ...submitted, votes: [...submitted.votes].reverse() }, room.hostToken);
    assert.equal(replay.status, "completed");
    assert.equal((await database.select().from(votes).where(eq(votes.roomId, room.id))).length, 3);
    assert.deepEqual(await service.submit(ballot(room), room.hostToken), { status: "conflict" });
    assert.deepEqual(
      await service.submit({ ...submitted, votes: [{ ...submitted.votes[0]!, value: "no" }, ...submitted.votes.slice(1)] }, room.hostToken),
      { status: "conflict" },
    );
  });

  await context.test("keeps a participant request ID single-use across rounds while allowing the same UUID for the other participant", async () => {
    const room = await createRoom(0);
    const requestId = randomUUID();
    const firstRoundBallot = ballot(room, requestId);
    assert.equal((await service.submit(firstRoundBallot, room.hostToken)).status, "completed");
    const nextRound = await createNextVotingRound(room, 3);

    assert.deepEqual(await service.submit(ballot(nextRound, requestId), room.hostToken), { status: "conflict" });
    assert.equal(
      (
        await database
          .select()
          .from(votes)
          .where(and(eq(votes.roomId, room.id), eq(votes.roundId, nextRound.roundId), eq(votes.participantId, room.hostId)))
      ).length,
      0,
    );
    await assert.rejects(
      database.insert(roundBallots).values({
        roomId: room.id,
        roundId: nextRound.roundId,
        participantId: room.hostId,
        requestId,
        payloadHash: "a".repeat(64),
      }),
      error => {
        const databaseError = error as { cause?: { code?: string }; code?: string };
        assert.equal(databaseError.cause?.code ?? databaseError.code, "23505");
        return true;
      },
    );

    assert.deepEqual(await service.submit(ballot(nextRound, requestId), room.guestToken), {
      status: "completed",
      roomId: room.id,
      roundId: nextRound.roundId,
      submittedCount: 1,
    });
  });

  await context.test("rolls back a failed full ballot without creating its completion marker", async () => {
    const room = await createRoom(3);
    const submitted = ballot(room);
    await database.insert(votes).values({
      roomId: room.id,
      roundId: room.roundId,
      participantId: room.hostId,
      movieId: room.movieIds[1],
      value: "no",
    });

    await assert.rejects(service.submit(submitted, room.hostToken));
    const hostVotes = await database
      .select()
      .from(votes)
      .where(and(eq(votes.roomId, room.id), eq(votes.participantId, room.hostId)));
    assert.deepEqual(
      hostVotes.map(vote => vote.movieId),
      [room.movieIds[1]],
    );
    assert.equal((await database.select().from(roundBallots).where(eq(roundBallots.roomId, room.id))).length, 0);
  });

  await context.test("atomically resolves a no-match and discloses both ballots only after its terminal commit", async () => {
    const room = await createRoom(6);
    const hostBallot = ballot(room, randomUUID(), ["want_to_watch", "could_watch", "no"]);
    const guestBallot = ballot(room, randomUUID(), ["no", "not_now", "want_to_watch"]);
    const [hostResult, guestResult] = await Promise.all([service.submit(hostBallot, room.hostToken), service.submit(guestBallot, room.guestToken)]);

    assert.equal(hostResult.status, "completed");
    assert.equal(guestResult.status, "completed");
    assert.equal((await database.select().from(votes).where(eq(votes.roomId, room.id))).length, 6);
    assert.equal((await database.select().from(roundBallots).where(eq(roundBallots.roomId, room.id))).length, 2);
    assert.deepEqual(await database.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, room.roundId)), [{ status: "no_match" }]);
    assert.deepEqual(await database.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, room.id)), [{ status: "playing" }]);
    assert.equal(
      (
        await database
          .select()
          .from(roundMovies)
          .where(and(eq(roundMovies.roundId, room.roundId), eq(roundMovies.isSelected, true)))
      ).length,
      0,
    );

    const tvSnapshot = await snapshotService.getTvRoomState(room.code);
    const hostSnapshot = await snapshotService.getClientRoomState(room.id, room.hostToken);
    const guestSnapshot = await snapshotService.getClientRoomState(room.id, room.guestToken);
    assert.ok(tvSnapshot && hostSnapshot && guestSnapshot);
    const tvRound = tvSnapshot.snapshot.currentRound;
    const hostRound = hostSnapshot.snapshot.currentRound;
    const guestRound = guestSnapshot.snapshot.currentRound;
    assert.ok(tvRound && hostRound && guestRound);
    assert.equal(tvSnapshot.snapshot.ballotProgress, null);
    assert.deepEqual(tvRound.result, {
      status: "no_match",
      selectedMovieId: null,
      movieVotes: [
        {
          movieId: room.movieIds[0],
          votes: [
            { role: "host", value: "want_to_watch" },
            { role: "guest", value: "no" },
          ],
        },
        {
          movieId: room.movieIds[1],
          votes: [
            { role: "host", value: "could_watch" },
            { role: "guest", value: "not_now" },
          ],
        },
        {
          movieId: room.movieIds[2],
          votes: [
            { role: "host", value: "no" },
            { role: "guest", value: "want_to_watch" },
          ],
        },
      ],
    });
    assert.deepEqual(hostRound.result, tvRound.result);
    assert.deepEqual(guestRound.result, tvRound.result);
    assert.deepEqual(hostSnapshot.snapshot.ownBallot, {
      status: "submitted",
      votes: [...hostBallot.votes].sort((left, right) => left.movieId - right.movieId),
    });
    assert.deepEqual(guestSnapshot.snapshot.ownBallot, {
      status: "submitted",
      votes: [...guestBallot.votes].sort((left, right) => left.movieId - right.movieId),
    });
    const tvPayload = JSON.stringify(tvSnapshot.snapshot);
    assert.equal(tvPayload.includes("want_to_watch"), true);
    assert.equal(tvPayload.includes("could_watch"), true);
    assert.equal(tvPayload.includes("not_now"), true);
    assert.equal(tvPayload.includes('"no"'), true);
    assert.equal(JSON.stringify(hostSnapshot.snapshot).includes("requestId"), false);
    assert.equal(JSON.stringify(hostSnapshot.snapshot).includes(room.guestId), false);
  });

  await context.test("chooses and persists the strongest match exactly once, then rolls back a corrupt terminal transition", async () => {
    const room = await createRoom(0);
    const hostBallot = ballot(room, randomUUID(), ["could_watch", "want_to_watch", "could_watch"]);
    const guestBallot = ballot(room, randomUUID(), ["could_watch", "could_watch", "could_watch"]);
    await service.submit(hostBallot, room.hostToken);

    const privateSnapshot = await snapshotService.getTvRoomState(room.code);
    assert.ok(privateSnapshot);
    assert.equal(JSON.stringify(privateSnapshot.snapshot).includes("want_to_watch"), false);
    assert.deepEqual(await database.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, room.roundId)), [{ status: "voting" }]);

    await service.submit(guestBallot, room.guestToken);
    assert.deepEqual(await database.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, room.roundId)), [{ status: "matched" }]);
    assert.deepEqual(await database.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, room.id)), [{ status: "matched" }]);
    assert.deepEqual(
      await database
        .select({ movieId: roundMovies.movieId })
        .from(roundMovies)
        .where(and(eq(roundMovies.roundId, room.roundId), eq(roundMovies.isSelected, true))),
      [{ movieId: room.movieIds[1] }],
    );
    const replay = await service.submit({ ...guestBallot, votes: [...guestBallot.votes].reverse() }, room.guestToken);
    assert.equal(replay.status, "completed");
    assert.deepEqual(
      await database
        .select({ movieId: roundMovies.movieId })
        .from(roundMovies)
        .where(and(eq(roundMovies.roundId, room.roundId), eq(roundMovies.isSelected, true))),
      [{ movieId: room.movieIds[1] }],
    );

    const corruptRoom = await createRoom(3);
    await service.submit(ballot(corruptRoom), corruptRoom.hostToken);
    await database
      .update(roundMovies)
      .set({ isSelected: true })
      .where(and(eq(roundMovies.roundId, corruptRoom.roundId), eq(roundMovies.movieId, corruptRoom.movieIds[0])));
    await assert.rejects(service.submit(ballot(corruptRoom), corruptRoom.guestToken));
    assert.equal(
      (
        await database
          .select()
          .from(votes)
          .where(and(eq(votes.roomId, corruptRoom.id), eq(votes.roundId, corruptRoom.roundId)))
      ).length,
      3,
    );
    assert.equal(
      (
        await database
          .select()
          .from(roundBallots)
          .where(and(eq(roundBallots.roomId, corruptRoom.id), eq(roundBallots.roundId, corruptRoom.roundId)))
      ).length,
      1,
    );
    assert.deepEqual(await database.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, corruptRoom.roundId)), [{ status: "voting" }]);
  });

  await context.test("rejects foreign rooms and keeps ballots server-only with room cascades", async () => {
    const firstRoom = await createRoom(9);
    const secondRoom = await createRoom(12);
    assert.deepEqual(await service.submit(ballot(firstRoom), secondRoom.hostToken), { status: "unavailable" });
    assert.equal((await database.select().from(votes).where(eq(votes.roomId, firstRoom.id))).length, 0);

    const security = await database.execute<{ rls: boolean; can_read: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(sql`
      select relrowsecurity as rls,
        has_table_privilege(role, 'public.round_ballots', 'SELECT') as can_read,
        has_table_privilege(role, 'public.round_ballots', 'INSERT') as can_insert,
        has_table_privilege(role, 'public.round_ballots', 'UPDATE') as can_update,
        has_table_privilege(role, 'public.round_ballots', 'DELETE') as can_delete
      from pg_class cross join (values ('anon'), ('authenticated')) roles(role)
      where oid = 'public.round_ballots'::regclass`);
    assert.equal(security.length, 2);
    for (const row of security) {
      assert.deepEqual(row, { rls: true, can_read: false, can_insert: false, can_update: false, can_delete: false });
    }

    await service.submit(ballot(secondRoom), secondRoom.hostToken);
    await database.delete(rooms).where(eq(rooms.id, secondRoom.id));
    assert.equal((await database.select().from(roundBallots).where(eq(roundBallots.roomId, secondRoom.id))).length, 0);
  });
});
