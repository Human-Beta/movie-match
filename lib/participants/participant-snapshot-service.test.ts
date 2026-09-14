import assert from "node:assert/strict";
import test from "node:test";

import type { PublicRoomMovie } from "@/lib/participants/public-participant-snapshot";
import type { ParticipantSnapshotRepository, ParticipantSnapshotRecord } from "@/lib/participants/participant-snapshot-service";
import {
  createParticipantRealtimeTopic,
  getRoomIdFromParticipantRealtimeTopic,
  ParticipantSnapshotService,
} from "@/lib/participants/participant-snapshot-service";

const now = new Date("2026-08-23T12:00:00.000Z");
const roomId = "11111111-1111-4111-8111-111111111111";

function makeRecord(): ParticipantSnapshotRecord {
  const hostWithPrivateFields = {
    id: "participant-internal-id",
    name: "Олена",
    role: "host" as const,
    accessTokenHash: "hash-must-not-reach-the-client",
    rawAccessToken: "token-must-not-reach-the-client",
  };

  return {
    room: {
      id: roomId,
      code: "ABC123",
      status: "waiting",
      exhaustionReason: null,
      expiresAt: new Date("2026-08-23T13:00:00.000Z"),
    },
    participants: [{ name: "Марко", role: "guest" }, hostWithPrivateFields],
    currentRound: null,
  };
}

class StubParticipantSnapshotRepository implements ParticipantSnapshotRepository {
  constructor(private readonly record: ParticipantSnapshotRecord | null = makeRecord()) {}

  async findByRoomCode(roomCode: string): Promise<ParticipantSnapshotRecord | null> {
    return this.record?.room.code === roomCode ? this.record : null;
  }

  async findByRoomId(candidateRoomId: string): Promise<ParticipantSnapshotRecord | null> {
    return this.record?.room.id === candidateRoomId ? this.record : null;
  }
}

function makeService(record: ParticipantSnapshotRecord | null = makeRecord()): ParticipantSnapshotService {
  return new ParticipantSnapshotService(new StubParticipantSnapshotRepository(record), { now: () => now });
}

test("sanitizes the authoritative snapshot to state, count, name, and role", () => {
  const snapshot = makeService().toPublicSnapshot(makeRecord());
  const serializedSnapshot = JSON.stringify(snapshot);

  assert.deepEqual(snapshot, {
    currentRound: null,
    exhaustionReason: null,
    roomState: "waiting",
    participantCount: 2,
    participants: [
      { name: "Олена", role: "host" },
      { name: "Марко", role: "guest" },
    ],
  });
  assert.equal(serializedSnapshot.includes(roomId), false);
  assert.equal(serializedSnapshot.includes("ABC123"), false);
  assert.equal(serializedSnapshot.includes("participant-internal-id"), false);
  assert.equal(serializedSnapshot.includes("accessToken"), false);
  assert.equal(serializedSnapshot.includes("hash-must-not"), false);
  assert.equal(serializedSnapshot.includes("token-must-not"), false);
});

test("derives a capability topic from the room UUID rather than the short code", async () => {
  const topic = createParticipantRealtimeTopic(roomId);
  const state = await makeService().getTvRoomState(" abc123 ");

  assert.equal(topic, `room:${roomId}`);
  assert.equal(topic.includes("ABC123"), false);
  assert.equal(getRoomIdFromParticipantRealtimeTopic(topic), roomId);
  assert.equal(getRoomIdFromParticipantRealtimeTopic("room:ABC123"), null);
  assert.equal(getRoomIdFromParticipantRealtimeTopic(`ABC123:${roomId}`), null);
  assert.ok(state);
  assert.equal(state.roomCode, "ABC123");
  assert.equal(state.realtimeTopic, topic);
  assert.equal(JSON.stringify(state).includes("accessToken"), false);
});

test("returns a snapshot by topic without reflecting forged payload state", async () => {
  const topic = createParticipantRealtimeTopic(roomId);
  const snapshot = await makeService().getSnapshotForTopic(topic);

  assert.deepEqual(snapshot, {
    currentRound: null,
    exhaustionReason: null,
    roomState: "waiting",
    participantCount: 2,
    participants: [
      { name: "Олена", role: "host" },
      { name: "Марко", role: "guest" },
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes(topic), false);
  assert.equal(await makeService().getSnapshotForTopic("room:ABC123"), null);
});

test("rebuilds an ordered public round allowlist without internal fields", () => {
  const record = makeRecord();
  const privateRound = {
    roundId: "22222222-2222-4222-8222-222222222222",
    roundNumber: 1,
    status: "voting" as const,
    movies: [
      {
        movieId: 20,
        position: 2,
        title: "Другий фільм",
        posterPath: null,
        releaseYear: 2012,
        runtimeMinutes: 100,
        genres: ["Драма"],
        internalSeedKey: "must-not-reach-client",
      },
      {
        movieId: 10,
        position: 1,
        title: "Перший фільм",
        posterPath: "/poster.jpg",
        releaseYear: 2011,
        runtimeMinutes: 90,
        genres: ["Комедія"],
        availableOnNetflix: true,
      },
      {
        movieId: 30,
        position: 3,
        title: "Третій фільм",
        posterPath: null,
        releaseYear: 2013,
        runtimeMinutes: 110,
        genres: ["Бойовик"],
      },
    ] as [PublicRoomMovie & { internalSeedKey: string }, PublicRoomMovie & { availableOnNetflix: boolean }, PublicRoomMovie],
  };
  record.currentRound = privateRound;

  const snapshot = makeService().toPublicSnapshot(record);
  assert.deepEqual(snapshot.currentRound, {
    roundId: "22222222-2222-4222-8222-222222222222",
    roundNumber: 1,
    status: "voting",
    movies: [
      {
        movieId: 10,
        position: 1,
        title: "Перший фільм",
        posterPath: "/poster.jpg",
        releaseYear: 2011,
        runtimeMinutes: 90,
        genres: ["Комедія"],
      },
      {
        movieId: 20,
        position: 2,
        title: "Другий фільм",
        posterPath: null,
        releaseYear: 2012,
        runtimeMinutes: 100,
        genres: ["Драма"],
      },
      {
        movieId: 30,
        position: 3,
        title: "Третій фільм",
        posterPath: null,
        releaseYear: 2013,
        runtimeMinutes: 110,
        genres: ["Бойовик"],
      },
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes("internalSeedKey"), false);
  assert.equal(JSON.stringify(snapshot).includes("availableOnNetflix"), false);
});

test("treats expired rooms as closed and withholds initial channel state", async () => {
  const record = makeRecord();
  record.room.expiresAt = now;
  const service = makeService(record);

  assert.equal(service.toPublicSnapshot(record).roomState, "closed");
  assert.equal(await service.getTvRoomState("ABC123"), null);
  assert.equal(await service.getClientRoomState(roomId), null);
});
