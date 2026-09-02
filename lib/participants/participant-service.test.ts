import assert from "node:assert/strict";
import test from "node:test";

import type { JoinParticipantInput } from "@/lib/participants/participant-service";
import {
  ParticipantService,
  type JoinParticipantResult,
  type LockedParticipantRoom,
  type ParticipantIdentity,
  type ParticipantRepository,
  type ParticipantRole,
  type ParticipantRoom,
  type ParticipantRoomSnapshot,
} from "@/lib/participants/participant-service";
import { generateParticipantAccessToken, hashParticipantAccessToken, PARTICIPANT_ACCESS_TOKEN_BYTES } from "@/lib/participants/participant-token";
import type { RoomStatus } from "@/lib/rooms/room-service";

const currentTime = new Date("2026-08-23T12:00:00.000Z");
const expirationTime = new Date("2026-08-23T13:00:00.000Z");

type StoredParticipant = ParticipantIdentity & { accessTokenHash: string };
type JoinedParticipantResult = Extract<JoinParticipantResult, { status: "joined" }>;

function makeAccessToken(byte: number): string {
  return generateParticipantAccessToken(() => Uint8Array.from({ length: PARTICIPANT_ACCESS_TOKEN_BYTES }, () => byte));
}

function assertJoined(result: JoinParticipantResult): asserts result is JoinedParticipantResult {
  assert.equal(result.status, "joined");
}

class SerializedParticipantRepository implements ParticipantRepository {
  readonly participants: StoredParticipant[] = [];
  room: ParticipantRoom | null = {
    id: "room-1",
    code: "ABC123",
    status: "waiting",
    expiresAt: expirationTime,
  };

  private nextParticipantId = 1;
  private transactionTail: Promise<void> = Promise.resolve();

  async inspectRoom(roomCode: string, accessTokenHash: string | null): Promise<ParticipantRoomSnapshot> {
    if (!this.room || this.room.code !== roomCode) {
      return { room: null, participant: null, participantCount: 0 };
    }

    const storedParticipant = accessTokenHash
      ? (this.participants.find(participant => participant.accessTokenHash === accessTokenHash) ?? null)
      : null;

    return {
      room: this.room,
      participant: storedParticipant
        ? {
            id: storedParticipant.id,
            name: storedParticipant.name,
            role: storedParticipant.role,
          }
        : null,
      participantCount: this.participants.length,
    };
  }

  async inLockedRoom<T>(roomCode: string, operation: (room: ParticipantRoom | null, lockedRoom: LockedParticipantRoom) => Promise<T>): Promise<T> {
    let releaseTransaction!: () => void;
    const priorTransaction = this.transactionTail;
    this.transactionTail = new Promise(resolve => {
      releaseTransaction = resolve;
    });

    await priorTransaction;

    const room = this.room?.code === roomCode ? this.room : null;
    const lockedRoom: LockedParticipantRoom = {
      findParticipantByAccessTokenHash: async accessTokenHash => {
        const participant = this.participants.find(candidate => candidate.accessTokenHash === accessTokenHash);

        return participant
          ? {
              id: participant.id,
              name: participant.name,
              role: participant.role,
            }
          : null;
      },
      listParticipantRoles: async () => this.participants.map(participant => participant.role),
      createParticipant: async input => {
        if (this.participants.some(participant => participant.role === input.role)) {
          throw new Error("The room-role constraint was violated.");
        }

        if (this.participants.some(participant => participant.accessTokenHash === input.accessTokenHash)) {
          throw new Error("The token-hash constraint was violated.");
        }

        const participant: StoredParticipant = {
          id: `participant-${this.nextParticipantId}`,
          ...input,
        };
        this.nextParticipantId += 1;
        this.participants.push(participant);

        return {
          id: participant.id,
          name: participant.name,
          role: participant.role,
        };
      },
    };

    try {
      return await operation(room, lockedRoom);
    } finally {
      releaseTransaction();
    }
  }
}

function makeService(repository: SerializedParticipantRepository): ParticipantService {
  return new ParticipantService(repository, {
    clock: { now: () => currentTime },
  });
}

function joinInput(name: string, accessToken: string): JoinParticipantInput {
  return { roomCode: "ABC123", name, joinRequestToken: accessToken };
}

test("uses the waiting room expiration for a join request", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);

  assert.equal(await service.getJoinRequestExpiresAt(" abc123 "), expirationTime);

  if (repository.room) {
    repository.room = { ...repository.room, expiresAt: currentTime };
  }

  assert.equal(await service.getJoinRequestExpiresAt("ABC123"), null);
});

test("serializes simultaneous second and third joins into guest and full", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);
  const hostToken = makeAccessToken(1);
  const guestToken = makeAccessToken(2);

  const hostResult = await service.joinParticipant(joinInput("Настя", hostToken), null);
  assertJoined(hostResult);
  assert.equal(hostResult.participant.role, "host");

  const concurrentResults = await Promise.all([
    service.joinParticipant(joinInput("Марко", guestToken), null),
    service.joinParticipant(joinInput("Ірина", makeAccessToken(3)), null),
  ]);

  assert.deepEqual(concurrentResults.map(result => result.status).sort(), ["full", "joined"]);
  assert.deepEqual(repository.participants.map(participant => participant.role).sort() satisfies ParticipantRole[], ["guest", "host"]);
  assert.equal(repository.participants.length, 2);
  assert.equal(new Set(repository.participants.map(participant => participant.role)).size, 2);
  assert.equal(
    repository.participants.some(participant => participant.accessTokenHash === hostToken || participant.accessTokenHash === guestToken),
    false,
  );
});

test("replays a lost join response without consuming another slot", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);
  const hostToken = makeAccessToken(4);
  const input = joinInput("Настя", hostToken);
  const firstJoin = await service.joinParticipant(input, null);

  assertJoined(firstJoin);

  const retriedJoin = await service.joinParticipant(input, null);

  assertJoined(retriedJoin);
  assert.equal(retriedJoin.participant.id, firstJoin.participant.id);
  assert.equal(retriedJoin.participant.name, "Настя");
  assert.equal(retriedJoin.newSession?.rawAccessToken, hostToken);
  assert.equal(repository.participants.length, 1);
});

test("restores the identical participant from its session in a later active state", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);
  const hostToken = makeAccessToken(5);
  const firstJoin = await service.joinParticipant(joinInput("Настя", hostToken), null);
  assertJoined(firstJoin);

  if (repository.room) {
    repository.room = { ...repository.room, status: "playing" };
  }

  const repeatedJoin = await service.joinParticipant(joinInput("Інше імʼя", makeAccessToken(6)), hostToken);

  assertJoined(repeatedJoin);
  assert.equal(repeatedJoin.participant.id, firstJoin.participant.id);
  assert.equal(repeatedJoin.participant.name, "Настя");
  assert.equal(repeatedJoin.newSession, null);
  assert.equal(repository.participants.length, 1);

  const outsider = await service.joinParticipant(joinInput("Марко", makeAccessToken(7)), null);
  assert.deepEqual(outsider, { status: "unavailable" });
});

test("allows both participant roles to use the same display name", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);

  const host = await service.joinParticipant(joinInput("Саша", makeAccessToken(8)), null);
  const guest = await service.joinParticipant(joinInput("Саша", makeAccessToken(9)), null);

  assertJoined(host);
  assertJoined(guest);
  assert.deepEqual(
    repository.participants.map(participant => participant.name),
    ["Саша", "Саша"],
  );
});

test("rejects new participants in every non-waiting active state", async () => {
  for (const status of ["playing", "matched", "exhausted"] satisfies RoomStatus[]) {
    const repository = new SerializedParticipantRepository();
    const service = makeService(repository);

    if (repository.room) {
      repository.room = { ...repository.room, status };
    }

    const result = await service.joinParticipant(joinInput("Настя", makeAccessToken(10)), null);

    assert.deepEqual(result, { status: "unavailable" });
    assert.equal(repository.participants.length, 0);
  }
});

test("does not restore or create participants in closed or expired rooms", async () => {
  for (const status of ["closed", "waiting"] satisfies RoomStatus[]) {
    const repository = new SerializedParticipantRepository();
    const service = makeService(repository);
    const accessToken = makeAccessToken(status === "closed" ? 11 : 12);
    const joined = await service.joinParticipant(joinInput("Настя", accessToken), null);
    assertJoined(joined);

    if (repository.room) {
      repository.room = {
        ...repository.room,
        expiresAt: status === "waiting" ? currentTime : expirationTime,
        status,
      };
    }

    assert.deepEqual(await service.joinParticipant(joinInput("Настя", makeAccessToken(13)), accessToken), { status: "unavailable" });
    assert.equal(repository.participants.length, 1);
  }
});

test("returns form, full, unavailable, and restored page states", async () => {
  const repository = new SerializedParticipantRepository();
  const service = makeService(repository);
  const hostToken = makeAccessToken(14);
  const guestToken = makeAccessToken(15);

  assert.deepEqual(await service.getJoinRoomView(" ab12cd ", null), {
    status: "unavailable",
  });
  assert.deepEqual(await service.getJoinRoomView("abc123", null), {
    status: "form",
    roomCode: "ABC123",
  });

  const host = await service.joinParticipant(joinInput("Настя", hostToken), null);
  const guest = await service.joinParticipant(joinInput("Марко", guestToken), null);
  assertJoined(host);
  assertJoined(guest);

  assert.deepEqual(await service.getJoinRoomView("ABC123", null), {
    status: "full",
  });
  const restoredView = await service.getJoinRoomView("ABC123", hostToken);
  assert.equal(restoredView.status, "joined");
  assert.equal(restoredView.participant.name, "Настя");
  assert.equal(restoredView.participant.role, "host");

  assert.equal(repository.participants.at(0)?.accessTokenHash, hashParticipantAccessToken(hostToken));
});
