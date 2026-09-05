import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { participants, rooms } from "@/lib/db/schema";
import { DrizzleParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-repository";
import { createParticipantRealtimeTopic, ParticipantSnapshotService } from "@/lib/participants/participant-snapshot-service";

config({ path: ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the participant snapshot database test.");
}

const databaseHost = new URL(databaseUrl).hostname;

if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost") {
  throw new Error("The participant snapshot database test only runs against local PostgreSQL.");
}

test("real PostgreSQL snapshot selects and returns only public participant fields", async context => {
  const client = postgres(databaseUrl, { max: 5, prepare: false });
  const database = drizzle(client, { schema });
  const repository = new DrizzleParticipantSnapshotRepository(async () => database);
  const service = new ParticipantSnapshotService(repository);
  const roomCode = randomBytes(4).toString("hex").toUpperCase();
  const roomRows = await database.insert(rooms).values({ code: roomCode }).returning({ id: rooms.id });
  const room = roomRows.at(0) ?? null;

  assert.ok(room);
  context.after(async () => {
    await database.delete(rooms).where(eq(rooms.id, room.id));
    await client.end();
  });

  const insertedParticipants = await database
    .insert(participants)
    .values([
      {
        roomId: room.id,
        role: "host",
        name: "Олена",
        accessTokenHash: "a".repeat(64),
      },
      {
        roomId: room.id,
        role: "guest",
        name: "Марко",
        accessTokenHash: "b".repeat(64),
      },
    ])
    .returning({
      id: participants.id,
      accessTokenHash: participants.accessTokenHash,
    });
  const record = await repository.findByRoomCode(roomCode);

  assert.ok(record);
  assert.deepEqual(
    new Set(record.participants.map(participant => `${participant.role}:${participant.name}`)),
    new Set(["host:Олена", "guest:Марко"]),
  );

  const serializedRecord = JSON.stringify(record);

  for (const participant of insertedParticipants) {
    assert.equal(serializedRecord.includes(participant.id), false);
    assert.equal(serializedRecord.includes(participant.accessTokenHash), false);
  }

  const topic = createParticipantRealtimeTopic(room.id);
  const snapshot = await service.getSnapshotForTopic(topic);
  const serializedSnapshot = JSON.stringify(snapshot);

  assert.deepEqual(snapshot, {
    roomState: "waiting",
    participantCount: 2,
    participants: [
      { name: "Олена", role: "host" },
      { name: "Марко", role: "guest" },
    ],
  });
  assert.equal(serializedSnapshot.includes(room.id), false);
  assert.equal(serializedSnapshot.includes(topic), false);
  assert.equal(serializedSnapshot.includes("accessToken"), false);
});
