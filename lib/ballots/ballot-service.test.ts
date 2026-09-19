import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { BallotInput } from "@/lib/ballots/ballot-input";
import { BallotService, type BallotReceipt, type BallotRepository, type BallotRoom, type LockedBallotRoom } from "@/lib/ballots/ballot-service";
import type { PersistedRoundResolutionState, RoundResolution } from "@/lib/matches/round-resolver";
import { hashParticipantAccessToken } from "@/lib/participants/participant-token";

const now = new Date("2026-09-13T12:00:00.000Z");
const roundId = "11111111-1111-4111-8111-111111111111";
const otherRoundId = "22222222-2222-4222-8222-222222222222";
const participantToken = "abcdefghijklmnopqrstuvwxyzABCDEFG01234567_-";

class StubBallotRepository implements BallotRepository {
  readonly receipts = new Map<string, BallotReceipt>();
  readonly savedVotes: BallotInput["votes"][] = [];
  currentRoundId: string | null = roundId;
  currentRoundMovieIds = [10, 20, 30];
  participantAvailable = true;
  room: BallotRoom | null = {
    id: "33333333-3333-4333-8333-333333333333",
    status: "playing",
    expiresAt: new Date("2026-09-13T13:00:00.000Z"),
  };
  readonly roundResolutionState: PersistedRoundResolutionState = {
    status: "voting",
    movies: [
      { movieId: 10, isSelected: false },
      { movieId: 20, isSelected: false },
      { movieId: 30, isSelected: false },
    ],
    ballots: [],
    votes: [],
  };

  async inLockedRoom<T>(roomCode: string, operation: (room: BallotRoom | null, locked: LockedBallotRoom) => Promise<T>): Promise<T> {
    assert.equal(roomCode, "ABCD");
    return operation(this.room, {
      findParticipant: async accessTokenHash =>
        this.participantAvailable && accessTokenHash === hashParticipantAccessToken(participantToken) ? { id: "participant" } : null,
      findBallot: async (participantId, lookup) => {
        if ("requestId" in lookup) {
          return this.receipts.get(`${participantId}:${lookup.requestId}`) ?? null;
        }

        return (
          [...this.receipts.entries()].find(([key, receipt]) => key.startsWith(`${participantId}:`) && receipt.roundId === lookup.roundId)?.[1] ??
          null
        );
      },
      findVotingRound: async () => (this.currentRoundId === null ? null : { id: this.currentRoundId, movieIds: this.currentRoundMovieIds }),
      saveBallot: async input => {
        this.savedVotes.push(input.votes);
        this.receipts.set(`${input.participantId}:${input.requestId}`, { roundId: input.roundId, payloadHash: input.payloadHash });
        this.roundResolutionState.ballots.push({ participantId: input.participantId });
        this.roundResolutionState.votes.push(
          ...input.votes.map(vote => ({ participantId: input.participantId, movieId: vote.movieId, value: vote.value })),
        );
      },
      countSubmittedBallots: async candidateRoundId => [...this.receipts.values()].filter(receipt => receipt.roundId === candidateRoundId).length,
      readRoundResolution: async candidateRoundId => (candidateRoundId === this.currentRoundId ? this.roundResolutionState : null),
      persistRoundResolution: async (candidateRoundId: string, resolution: RoundResolution) => {
        void candidateRoundId;
        void resolution;
      },
    });
  }
}

function input(overrides: Partial<BallotInput> = {}): BallotInput {
  return {
    roomCode: "ABCD",
    roundId,
    requestId: randomUUID(),
    votes: [
      { movieId: 10, value: "want_to_watch" },
      { movieId: 20, value: "could_watch" },
      { movieId: 30, value: "no" },
    ],
    ...overrides,
  };
}

test("stores exactly one complete ballot and replays the canonical request after response loss", async (): Promise<void> => {
  const repository = new StubBallotRepository();
  const service = new BallotService(repository, { now: (): Date => now });
  const first = input();

  assert.deepEqual(await service.submit(first, participantToken), {
    status: "completed",
    roomId: repository.room?.id,
    roundId,
    submittedCount: 1,
  });
  assert.deepEqual(await service.submit({ ...first, votes: [...first.votes].reverse() }, participantToken), {
    status: "completed",
    roomId: repository.room?.id,
    roundId,
    submittedCount: 1,
  });
  assert.equal(repository.savedVotes.length, 1);
});

test("rejects altered retry and a new ballot after immutable completion", async (): Promise<void> => {
  const repository = new StubBallotRepository();
  const service = new BallotService(repository, { now: (): Date => now });
  const first = input();
  await service.submit(first, participantToken);

  assert.deepEqual(await service.submit({ ...first, votes: [{ movieId: 10, value: "no" }, ...first.votes.slice(1)] }, participantToken), {
    status: "conflict",
  });
  assert.deepEqual(await service.submit(input(), participantToken), { status: "conflict" });
  assert.equal(repository.savedVotes.length, 1);
});

test("replays only an exact receipt after a later round starts and rejects cross-round key reuse", async (): Promise<void> => {
  const repository = new StubBallotRepository();
  const service = new BallotService(repository, { now: (): Date => now });
  const first = input();
  await service.submit(first, participantToken);
  repository.currentRoundId = otherRoundId;
  repository.currentRoundMovieIds = [40, 50, 60];

  assert.deepEqual(await service.submit(first, participantToken), {
    status: "completed",
    roomId: repository.room?.id,
    roundId,
    submittedCount: 1,
  });
  assert.deepEqual(
    await service.submit(
      input({
        roundId: otherRoundId,
        requestId: first.requestId,
        votes: [
          { movieId: 40, value: "want_to_watch" },
          { movieId: 50, value: "could_watch" },
          { movieId: 60, value: "no" },
        ],
      }),
      participantToken,
    ),
    { status: "conflict" },
  );
  assert.equal(repository.savedVotes.length, 1);
});

test("rejects incomplete, duplicate, foreign, inactive, expired, and anonymous ballots without writes", async (): Promise<void> => {
  const repository = new StubBallotRepository();
  const service = new BallotService(repository, { now: (): Date => now });

  assert.deepEqual(
    await service.submit(
      input({
        votes: [
          { movieId: 10, value: "no" },
          { movieId: 10, value: "no" },
          { movieId: 30, value: "no" },
        ],
      }),
      participantToken,
    ),
    {
      status: "unavailable",
    },
  );
  assert.deepEqual(await service.submit(input({ roundId: otherRoundId }), participantToken), { status: "unavailable" });
  assert.deepEqual(await service.submit(input(), null), { status: "unavailable" });
  repository.room = { id: "33333333-3333-4333-8333-333333333333", status: "waiting", expiresAt: new Date("2026-09-13T13:00:00.000Z") };
  assert.deepEqual(await service.submit(input(), participantToken), { status: "unavailable" });
  repository.room = { id: "33333333-3333-4333-8333-333333333333", status: "playing", expiresAt: now };
  assert.deepEqual(await service.submit(input(), participantToken), { status: "unavailable" });
  assert.equal(repository.savedVotes.length, 0);
});
