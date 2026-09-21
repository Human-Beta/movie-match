import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import { nextRoundInputSchema } from "@/lib/no-match-next-round/next-round-input";
import {
  NoMatchNextRoundService,
  type LockedNoMatchRoom,
  type NoMatchNextRoundRepository,
  type NoMatchNextRoundRoom,
  type NoMatchReadinessReceipt,
} from "@/lib/no-match-next-round/next-round-service";

const now = new Date("2026-09-21T10:00:00.000Z");
const hostToken = generateParticipantAccessToken();
const guestToken = generateParticipantAccessToken();
const roundId = "11111111-1111-4111-8111-111111111111";
const filters: RoomFilterValues = { netflixOnly: false, underTwoHours: false, yearFilter: "any", genreIds: [] };

class MemoryNoMatchRepository implements NoMatchNextRoundRepository {
  room: NoMatchNextRoundRoom | null = { id: "22222222-2222-4222-8222-222222222222", status: "playing", expiresAt: new Date(now.getTime() + 60_000) };
  currentRoundId = roundId;
  readiness: Array<NoMatchReadinessReceipt & { participantId: string }> = [];
  candidates = [4, 5, 6];
  rounds: Array<{ roundNumber: number; movieIds: readonly [number, number, number] }> = [];

  async inLockedRoom<T>(_roomCode: string, operation: (room: NoMatchNextRoundRoom | null, locked: LockedNoMatchRoom) => Promise<T>): Promise<T> {
    return operation(this.room, {
      findParticipant: async hash => {
        if (hash === hashParticipantAccessToken(hostToken)) {
          return { id: "33333333-3333-4333-8333-333333333333", role: "host" };
        }
        if (hash === hashParticipantAccessToken(guestToken)) {
          return { id: "44444444-4444-4444-8444-444444444444", role: "guest" };
        }
        return null;
      },
      findReadinessByRequest: async (participantId, requestId) =>
        this.readiness.find(item => item.participantId === participantId && item.requestId === requestId) ?? null,
      findReadiness: async (participantId, candidateRoundId) =>
        this.readiness.find(item => item.participantId === participantId && item.roundId === candidateRoundId) ?? null,
      isCurrentNoMatchRound: async candidateRoundId => candidateRoundId === this.currentRoundId,
      saveReadiness: async receipt => {
        this.readiness.push(receipt);
      },
      setReadinessOutcome: async (participantId, candidateRoundId, outcome) => {
        const receipt = this.readiness.find(item => item.participantId === participantId && item.roundId === candidateRoundId);
        if (receipt === undefined) {
          throw new Error("Expected the current participant readiness.");
        }
        receipt.outcome = outcome;
      },
      countReadiness: async candidateRoundId => this.readiness.filter(item => item.roundId === candidateRoundId).length,
      readFilters: async () => filters,
      selectEligibleMovieIds: async () => this.candidates,
      getNextRoundNumber: async () => this.rounds.length + 2,
      createRound: async (roundNumber, movieIds) => {
        this.rounds.push({ roundNumber, movieIds });
      },
      setRoomStatus: async status => {
        if (this.room !== null) {
          this.room = { ...this.room, status };
        }
      },
    });
  }
}

function service(repository: MemoryNoMatchRepository): NoMatchNextRoundService {
  return new NoMatchNextRoundService(repository, { now: () => now });
}

test("next-round input accepts only a room code and committed round/request UUIDs", () => {
  const input = { roomCode: " abcd ", roundId, requestId: randomUUID() };
  assert.deepEqual(nextRoundInputSchema.parse(input), { ...input, roomCode: "ABCD" });
  assert.equal(nextRoundInputSchema.safeParse({ ...input, movieIds: [1, 2, 3] }).success, false);
});

test("the first readiness waits and the second creates one sequential unseen round", async () => {
  const repository = new MemoryNoMatchRepository();
  const first = { roomCode: "ABCD", roundId, requestId: randomUUID() };
  const second = { roomCode: "ABCD", roundId, requestId: randomUUID() };

  assert.deepEqual(await service(repository).confirm(first, hostToken), { status: "completed", roomId: repository.room?.id, outcome: "ready" });
  assert.deepEqual(repository.rounds, []);
  assert.deepEqual(await service(repository).confirm(second, guestToken), { status: "completed", roomId: repository.room?.id, outcome: "started" });
  assert.deepEqual(repository.rounds, [{ roundNumber: 2, movieIds: [4, 5, 6] }]);
  assert.equal(repository.room?.status, "playing");
  assert.equal((await service(repository).confirm(second, guestToken)).status, "completed");
  assert.equal(repository.rounds.length, 1);
});

test("invalid authority, stale round, and exhausted candidates leave no successor", async () => {
  const input = { roomCode: "ABCD", roundId, requestId: randomUUID() };
  const anonymous = new MemoryNoMatchRepository();
  assert.deepEqual(await service(anonymous).confirm(input, null), { status: "unavailable" });
  assert.deepEqual(anonymous.readiness, []);

  const stale = new MemoryNoMatchRepository();
  stale.currentRoundId = randomUUID();
  assert.deepEqual(await service(stale).confirm(input, hostToken), { status: "unavailable" });
  assert.deepEqual(stale.readiness, []);

  const exhausted = new MemoryNoMatchRepository();
  exhausted.candidates = [1, 2];
  await service(exhausted).confirm(input, hostToken);
  const secondInput = { ...input, requestId: randomUUID() };
  assert.deepEqual(await service(exhausted).confirm(secondInput, guestToken), {
    status: "completed",
    roomId: exhausted.room?.id,
    outcome: "list_exhausted",
  });
  assert.equal(exhausted.room?.status, "exhausted");
  assert.deepEqual(exhausted.rounds, []);
});
