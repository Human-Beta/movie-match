import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { participants, rooms } from "@/lib/db/schema";
import { DrizzleParticipantRepository } from "@/lib/participants/participant-repository";
import { ParticipantService, type JoinParticipantResult } from "@/lib/participants/participant-service";
import { generateParticipantAccessToken } from "@/lib/participants/participant-token";

config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the join-room database test.");
}

const databaseHost = new URL(databaseUrl).hostname;

if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost") {
  throw new Error("The join-room database test only runs against local PostgreSQL.");
}

type JoinedParticipantResult = Extract<JoinParticipantResult, { status: "joined" }>;

function assertJoined(result: JoinParticipantResult): asserts result is JoinedParticipantResult {
  assert.equal(result.status, "joined");
}

test("real PostgreSQL row locking serializes simultaneous second and third joins", async context => {
  const client = postgres(databaseUrl, { max: 10, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleParticipantRepository(async () => database);
  const service = new ParticipantService(repository);
  const roomCode = randomBytes(4).toString("hex").toUpperCase();
  const roomRows = await database.insert(rooms).values({ code: roomCode }).returning({ id: rooms.id });
  const room = roomRows.at(0);

  assert.ok(room);
  context.after(async () => {
    await database.delete(rooms).where(eq(rooms.id, room.id));
    await client.end();
  });

  const hostToken = generateParticipantAccessToken();
  const hostInput = {
    roomCode,
    name: "Настя",
    joinRequestToken: hostToken,
  };
  const hostJoin = await service.joinParticipant(hostInput, null);
  assertJoined(hostJoin);

  const replayedHostJoin = await service.joinParticipant(hostInput, null);
  assertJoined(replayedHostJoin);
  assert.equal(replayedHostJoin.participant.id, hostJoin.participant.id);
  assert.equal(replayedHostJoin.newSession?.rawAccessToken, hostToken);

  const simultaneousResults = await Promise.all([
    service.joinParticipant(
      {
        roomCode,
        name: "Марко",
        joinRequestToken: generateParticipantAccessToken(),
      },
      null,
    ),
    service.joinParticipant(
      {
        roomCode,
        name: "Ірина",
        joinRequestToken: generateParticipantAccessToken(),
      },
      null,
    ),
  ]);

  assert.deepEqual(simultaneousResults.map(result => result.status).sort(), ["full", "joined"]);

  const storedParticipants = await database
    .select({
      id: participants.id,
      role: participants.role,
      accessTokenHash: participants.accessTokenHash,
    })
    .from(participants)
    .where(eq(participants.roomId, room.id));

  assert.equal(storedParticipants.length, 2);
  assert.deepEqual(storedParticipants.map(participant => participant.role).sort(), ["guest", "host"]);
  assert.equal(new Set(storedParticipants.map(participant => participant.accessTokenHash)).size, 2);
  assert.equal(
    storedParticipants.every(participant => /^[a-f0-9]{64}$/.test(participant.accessTokenHash)),
    true,
  );
  assert.equal(
    storedParticipants.some(participant => participant.accessTokenHash === hostJoin.newSession?.rawAccessToken),
    false,
  );

  await database.update(rooms).set({ status: "playing" }).where(eq(rooms.id, room.id));

  const restoredHost = await service.joinParticipant(
    {
      roomCode,
      name: "Інше імʼя",
      joinRequestToken: generateParticipantAccessToken(),
    },
    hostToken,
  );
  assertJoined(restoredHost);
  assert.equal(restoredHost.participant.id, hostJoin.participant.id);
  assert.equal(restoredHost.participant.name, "Настя");
  assert.equal(restoredHost.newSession, null);

  assert.deepEqual(
    await service.joinParticipant(
      {
        roomCode,
        name: "Третій",
        joinRequestToken: generateParticipantAccessToken(),
      },
      null,
    ),
    { status: "unavailable" },
  );

  const participantCountRows = await database
    .select({ participantCount: sql<number>`count(*)::int` })
    .from(participants)
    .where(eq(participants.roomId, room.id));
  const participantCountRow = participantCountRows.at(0);

  assert.ok(participantCountRow);
  assert.equal(participantCountRow.participantCount, 2);
});
