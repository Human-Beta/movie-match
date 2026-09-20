import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { gameCommandInputSchema } from "@/lib/game-rounds/game-command-input";
import {
  GameRoundService,
  type GameCommandReceipt,
  type GameRoom,
  type GameRoundRepository,
  type LockedGameRoom,
} from "@/lib/game-rounds/game-round-service";
import { generateParticipantAccessToken, hashParticipantAccessToken } from "@/lib/participants/participant-token";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

const now = new Date("2026-09-12T10:00:00.000Z");
const hostToken = generateParticipantAccessToken();
const guestToken = generateParticipantAccessToken();
const filters: RoomFilterValues = { netflixOnly: true, underTwoHours: true, yearFilter: "new", genreIds: [1, 2] };

class MemoryGameRoundRepository implements GameRoundRepository {
  room: GameRoom | null = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "waiting",
    expiresAt: new Date(now.getTime() + 60_000),
  };
  participantCount = 2;
  candidates = [1, 2, 3];
  fullCatalogCandidates: number[] | null = null;
  currentMatchedRoundHasSelectedMovie = true;
  receipts = new Map<string, GameCommandReceipt>();
  rounds: Array<{ roundNumber: number; movieIds: number[] }> = [];
  historyDeletes = 0;
  statusWrites = 0;
  lastFilterSelection: { filters: RoomFilterValues; excludeSeen: boolean } | null = null;

  async inLockedRoom<T>(_roomCode: string, operation: (room: GameRoom | null, locked: LockedGameRoom) => Promise<T>): Promise<T> {
    return operation(this.room, {
      findParticipantRole: async hash => {
        if (hash === hashParticipantAccessToken(hostToken)) {
          return "host";
        }
        if (hash === hashParticipantAccessToken(guestToken)) {
          return "guest";
        }
        return null;
      },
      countParticipants: async () => this.participantCount,
      readFilters: async () => filters,
      findCommand: async requestId => this.receipts.get(requestId) ?? null,
      hasCurrentMatchedRoundSelectedMovie: async () => this.currentMatchedRoundHasSelectedMovie,
      selectEligibleMovieIds: async (selectedFilters, excludeSeen) => {
        this.lastFilterSelection = { filters: selectedFilters, excludeSeen };
        return excludeSeen ? this.candidates : (this.fullCatalogCandidates ?? this.candidates);
      },
      getNextRoundNumber: async () => Math.max(0, ...this.rounds.map(round => round.roundNumber)) + 1,
      deleteRoundHistory: async () => {
        this.historyDeletes += 1;
        this.rounds = [];
      },
      createRound: async (roundNumber, movieIds) => {
        this.rounds.push({ roundNumber, movieIds: [...movieIds] });
      },
      setRoomStatus: async status => {
        if (this.room !== null) {
          this.room = { ...this.room, status };
        }
        this.statusWrites += 1;
      },
      saveCommand: async (requestId, receipt) => {
        this.receipts.set(requestId, receipt);
      },
    });
  }
}

function makeService(repository: MemoryGameRoundRepository): GameRoundService {
  return new GameRoundService(repository, { now: () => now });
}

function markMatched(repository: MemoryGameRoundRepository): void {
  const room = repository.room;
  assert.ok(room);
  repository.room = { ...room, status: "matched" };
}

test("game command boundary accepts only a normalized room code and UUID", () => {
  const requestId = randomUUID();
  assert.deepEqual(gameCommandInputSchema.parse({ roomCode: " abcd ", requestId }), { roomCode: "ABCD", requestId });

  for (const input of [
    { roomCode: "!", requestId },
    { roomCode: "ABCD", requestId: "bad" },
    { roomCode: "ABCD", requestId, role: "host" },
    { roomCode: "ABCD", requestId, movieIds: [1, 2, 3] },
    { roomCode: "ABCD", requestId, filters },
  ]) {
    assert.equal(gameCommandInputSchema.safeParse(input).success, false);
  }
});

test("start authorizes a current host and commits exactly one persisted ordered round", async () => {
  const repository = new MemoryGameRoundRepository();
  const service = makeService(repository);
  const input = { roomCode: "ABCD", requestId: randomUUID() };

  assert.deepEqual(await service.start(input, hostToken), {
    status: "completed",
    outcome: "started",
    roomId: repository.room?.id,
  });
  assert.deepEqual(repository.rounds, [{ roundNumber: 1, movieIds: [1, 2, 3] }]);
  assert.deepEqual(repository.lastFilterSelection, { filters, excludeSeen: true });
  assert.equal(repository.room?.status, "playing");

  repository.room = { ...repository.room!, status: "matched" };
  assert.equal((await service.start(input, hostToken)).status, "completed");
  assert.equal(repository.rounds.length, 1);
  assert.equal(repository.statusWrites, 1);
});

test("start rejects invalid authority, room state, expiration, and participant count without writes", async () => {
  for (const mutate of [
    (repository: MemoryGameRoundRepository): void => {
      repository.participantCount = 1;
    },
    (repository: MemoryGameRoundRepository): void => {
      repository.room = { ...repository.room!, status: "playing" };
    },
    (repository: MemoryGameRoundRepository): void => {
      repository.room = { ...repository.room!, expiresAt: now };
    },
    (repository: MemoryGameRoundRepository): void => {
      repository.room = null;
    },
  ]) {
    const repository = new MemoryGameRoundRepository();
    mutate(repository);
    assert.deepEqual(await makeService(repository).start({ roomCode: "ABCD", requestId: randomUUID() }, hostToken), { status: "unavailable" });
    assert.equal(repository.rounds.length, 0);
    assert.equal(repository.receipts.size, 0);
    assert.equal(repository.statusWrites, 0);
  }

  const repository = new MemoryGameRoundRepository();
  const service = makeService(repository);
  for (const token of [null, "bad", guestToken, generateParticipantAccessToken()]) {
    assert.deepEqual(await service.start({ roomCode: "ABCD", requestId: randomUUID() }, token), { status: "unavailable" });
  }
  assert.equal(repository.rounds.length, 0);
});

test("zero, one, or two unique candidates return a host-local outcome without a partial round", async () => {
  for (const candidates of [[], [1], [1, 2], [1, 1, 2]]) {
    const repository = new MemoryGameRoundRepository();
    repository.candidates = candidates;
    const result = await makeService(repository).start({ roomCode: "ABCD", requestId: randomUUID() }, hostToken);

    assert.equal(result.status, "completed");
    assert.equal(result.outcome, "catalog_insufficient");
    assert.equal(repository.room?.status, "waiting");
    assert.deepEqual(repository.rounds, []);
    assert.equal(repository.receipts.size, 1);
    assert.equal(repository.statusWrites, 0);
  }
});

test("start records a list-exhausted outcome when the full catalog can form a round", async () => {
  const repository = new MemoryGameRoundRepository();
  repository.candidates = [1, 2];
  repository.fullCatalogCandidates = [1, 2, 3];

  assert.deepEqual(await makeService(repository).start({ roomCode: "ABCD", requestId: randomUUID() }, hostToken), {
    status: "completed",
    outcome: "list_exhausted",
    roomId: repository.room?.id,
  });
  assert.equal(repository.room?.status, "exhausted");
  assert.deepEqual(repository.rounds, []);
});

test("request IDs replay their committed outcome and conflict across different commands", async () => {
  const repository = new MemoryGameRoundRepository();
  const service = makeService(repository);
  const input = { roomCode: "ABCD", requestId: randomUUID() };

  await service.start(input, hostToken);
  repository.room = { ...repository.room!, status: "exhausted" };

  assert.equal((await service.start(input, hostToken)).status, "completed");
  assert.deepEqual(await service.restart(input, hostToken), { status: "conflict" });
  assert.equal(repository.rounds.length, 1);
});

test("restart checks the full filtered catalog before deleting history and replays safely", async () => {
  const repository = new MemoryGameRoundRepository();
  repository.room = { ...repository.room!, status: "exhausted" };
  repository.rounds = [{ roundNumber: 4, movieIds: [7, 8, 9] }];
  repository.candidates = [1, 2];
  repository.fullCatalogCandidates = [1, 2];
  const service = makeService(repository);
  const insufficientInput = { roomCode: "ABCD", requestId: randomUUID() };

  assert.deepEqual(await service.restart(insufficientInput, hostToken), {
    status: "completed",
    outcome: "catalog_insufficient",
    roomId: repository.room.id,
  });
  assert.deepEqual(repository.rounds, [{ roundNumber: 4, movieIds: [7, 8, 9] }]);
  assert.equal(repository.historyDeletes, 0);
  assert.deepEqual(repository.lastFilterSelection, { filters, excludeSeen: false });

  repository.candidates = [4, 5, 6];
  repository.fullCatalogCandidates = null;
  repository.room = { ...repository.room!, status: "exhausted" };
  const successfulInput = { roomCode: "ABCD", requestId: randomUUID() };
  assert.equal((await service.restart(successfulInput, hostToken)).status, "completed");
  assert.deepEqual(repository.rounds, [{ roundNumber: 1, movieIds: [4, 5, 6] }]);
  assert.equal(repository.historyDeletes, 1);
  assert.equal(repository.room.status, "playing");

  assert.equal((await service.restart(successfulInput, hostToken)).status, "completed");
  assert.equal(repository.historyDeletes, 1);
  assert.deepEqual(repository.rounds, [{ roundNumber: 1, movieIds: [4, 5, 6] }]);
});

test("search again preserves history and creates the next unseen voting round only from a matched selection", async () => {
  const repository = new MemoryGameRoundRepository();
  markMatched(repository);
  repository.rounds = [{ roundNumber: 4, movieIds: [7, 8, 9] }];
  repository.candidates = [1, 2, 3];
  const service = makeService(repository);
  const input = { roomCode: "ABCD", requestId: randomUUID() };

  assert.deepEqual(await service.searchAgain(input, hostToken), {
    status: "completed",
    outcome: "started",
    roomId: repository.room?.id,
  });
  assert.deepEqual(repository.rounds, [
    { roundNumber: 4, movieIds: [7, 8, 9] },
    { roundNumber: 5, movieIds: [1, 2, 3] },
  ]);
  assert.equal(repository.historyDeletes, 0);
  assert.equal(repository.room?.status, "playing");
  assert.deepEqual(repository.lastFilterSelection, { filters, excludeSeen: true });

  const unavailableRepository = new MemoryGameRoundRepository();
  markMatched(unavailableRepository);
  unavailableRepository.currentMatchedRoundHasSelectedMovie = false;
  assert.deepEqual(await makeService(unavailableRepository).searchAgain({ roomCode: "ABCD", requestId: randomUUID() }, hostToken), {
    status: "unavailable",
  });
  assert.equal(unavailableRepository.receipts.size, 0);
});

test("search again exhausts a matched room without a partial round and close preserves history", async () => {
  const exhaustedRepository = new MemoryGameRoundRepository();
  markMatched(exhaustedRepository);
  exhaustedRepository.rounds = [{ roundNumber: 2, movieIds: [7, 8, 9] }];
  exhaustedRepository.candidates = [1, 2];
  const exhaustedResult = await makeService(exhaustedRepository).searchAgain({ roomCode: "ABCD", requestId: randomUUID() }, hostToken);
  assert.equal(exhaustedResult.status, "completed");
  assert.equal(exhaustedResult.outcome, "list_exhausted");
  assert.deepEqual(exhaustedRepository.rounds, [{ roundNumber: 2, movieIds: [7, 8, 9] }]);
  assert.equal(exhaustedRepository.room?.status, "exhausted");

  const closedRepository = new MemoryGameRoundRepository();
  markMatched(closedRepository);
  closedRepository.rounds = [{ roundNumber: 3, movieIds: [1, 2, 3] }];
  const closeInput = { roomCode: "ABCD", requestId: randomUUID() };
  const closeService = makeService(closedRepository);
  assert.equal((await closeService.close(closeInput, hostToken)).status, "completed");
  assert.equal(closedRepository.room?.status, "closed");
  assert.deepEqual(closedRepository.rounds, [{ roundNumber: 3, movieIds: [1, 2, 3] }]);
  assert.equal((await closeService.close(closeInput, hostToken)).status, "completed");
  assert.deepEqual(await closeService.searchAgain(closeInput, hostToken), { status: "conflict" });
});
