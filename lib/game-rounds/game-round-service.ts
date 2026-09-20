import { SystemClock, type Clock } from "@/lib/clock";
import { GAME_COMMAND, GAME_COMMAND_OUTCOME, type GameCommand, type GameCommandOutcome } from "@/lib/game-rounds/game-command";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { GameCommandInput } from "@/lib/game-rounds/game-command-input";
import { hashRoomFilterContract } from "@/lib/room-filters/filter-contract";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";
import { sha256Hex } from "@/lib/sha256";

export type GameCommandReceipt = {
  command: GameCommand;
  payloadHash: string;
  filterHash: string;
  outcome: GameCommandOutcome;
};

export type GameRoom = {
  id: string;
  status: RoomStatus;
  expiresAt: Date;
};

export type LockedGameRoom = {
  findParticipantRole(accessTokenHash: string): Promise<ParticipantRole | null>;
  countParticipants(): Promise<number>;
  readFilters(): Promise<RoomFilterValues>;
  findCommand(requestId: string): Promise<GameCommandReceipt | null>;
  hasCurrentMatchedRoundSelectedMovie(): Promise<boolean>;
  selectEligibleMovieIds(filters: RoomFilterValues, excludeSeen: boolean): Promise<number[]>;
  getNextRoundNumber(): Promise<number>;
  deleteRoundHistory(): Promise<void>;
  createRound(roundNumber: number, movieIds: readonly [number, number, number]): Promise<void>;
  setRoomStatus(status: "waiting" | "playing" | "exhausted" | "closed"): Promise<void>;
  saveCommand(requestId: string, receipt: GameCommandReceipt): Promise<void>;
};

export type GameRoundRepository = {
  inLockedRoom<T>(roomCode: string, operation: (room: GameRoom | null, locked: LockedGameRoom) => Promise<T>): Promise<T>;
};

export type GameCommandResult =
  { status: "completed"; outcome: GameCommandOutcome; roomId: string } | { status: "unavailable" } | { status: "conflict" };

type MovieIdTriplet = readonly [number, number, number];
const EMPTY_FILTER_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

function isMovieIdTriplet(movieIds: readonly number[]): movieIds is MovieIdTriplet {
  return movieIds.length === 3;
}

export class GameRoundService {
  constructor(
    private readonly repository: GameRoundRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  start(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute(GAME_COMMAND.START, input, storedAccessToken);
  }

  restart(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute(GAME_COMMAND.RESTART, input, storedAccessToken);
  }

  searchAgain(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute(GAME_COMMAND.SEARCH_AGAIN, input, storedAccessToken);
  }

  close(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute(GAME_COMMAND.CLOSE, input, storedAccessToken);
  }

  private async execute(command: GameCommand, input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (accessTokenHash === null) {
      return { status: "unavailable" };
    }

    const payloadHash = this.hashPayload(command, input);

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<GameCommandResult> => {
      if (room === null || room.expiresAt.getTime() <= this.clock.now().getTime()) {
        return { status: "unavailable" };
      }

      if ((await locked.findParticipantRole(accessTokenHash)) !== "host") {
        return { status: "unavailable" };
      }

      const previousCommand = await locked.findCommand(input.requestId);

      if (previousCommand !== null) {
        if (previousCommand.payloadHash !== payloadHash || previousCommand.command !== command) {
          return { status: "conflict" };
        }

        return { status: "completed", outcome: previousCommand.outcome, roomId: room.id };
      }

      if (room.status === "closed") {
        return { status: "unavailable" };
      }

      if (command === GAME_COMMAND.CLOSE) {
        if (room.status !== "matched") {
          return { status: "unavailable" };
        }

        await locked.setRoomStatus("closed");
        await locked.saveCommand(input.requestId, {
          command,
          payloadHash,
          filterHash: EMPTY_FILTER_HASH,
          outcome: GAME_COMMAND_OUTCOME.CLOSED,
        });

        return { status: "completed", outcome: GAME_COMMAND_OUTCOME.CLOSED, roomId: room.id };
      }

      if (command === GAME_COMMAND.SEARCH_AGAIN) {
        if (room.status !== "matched" || !(await locked.hasCurrentMatchedRoundSelectedMovie())) {
          return { status: "unavailable" };
        }

        const filters = await locked.readFilters();
        const filterHash = hashRoomFilterContract(filters);
        const movieIds = [...new Set(await locked.selectEligibleMovieIds(filters, true))];

        if (!isMovieIdTriplet(movieIds)) {
          await locked.setRoomStatus("exhausted");
          await locked.saveCommand(input.requestId, {
            command,
            payloadHash,
            filterHash,
            outcome: GAME_COMMAND_OUTCOME.LIST_EXHAUSTED,
          });

          return { status: "completed", outcome: GAME_COMMAND_OUTCOME.LIST_EXHAUSTED, roomId: room.id };
        }

        await locked.createRound(await locked.getNextRoundNumber(), movieIds);
        await locked.setRoomStatus("playing");
        await locked.saveCommand(input.requestId, {
          command,
          payloadHash,
          filterHash,
          outcome: GAME_COMMAND_OUTCOME.STARTED,
        });

        return { status: "completed", outcome: GAME_COMMAND_OUTCOME.STARTED, roomId: room.id };
      }

      if (command === GAME_COMMAND.START) {
        if (room.status !== "waiting" || (await locked.countParticipants()) !== 2) {
          return { status: "unavailable" };
        }
      } else if (room.status !== "exhausted") {
        return { status: "unavailable" };
      }

      const filters = await locked.readFilters();
      const filterHash = hashRoomFilterContract(filters);
      const movieIds = [...new Set(await locked.selectEligibleMovieIds(filters, command === GAME_COMMAND.START))];

      if (!isMovieIdTriplet(movieIds)) {
        const fullCatalogMovieIds = command === GAME_COMMAND.RESTART ? movieIds : [...new Set(await locked.selectEligibleMovieIds(filters, false))];
        const outcome: GameCommandOutcome = isMovieIdTriplet(fullCatalogMovieIds)
          ? GAME_COMMAND_OUTCOME.LIST_EXHAUSTED
          : GAME_COMMAND_OUTCOME.CATALOG_INSUFFICIENT;
        if (outcome === GAME_COMMAND_OUTCOME.LIST_EXHAUSTED) {
          await locked.setRoomStatus("exhausted");
        }
        await locked.saveCommand(input.requestId, { command, payloadHash, filterHash, outcome });

        return { status: "completed", outcome, roomId: room.id };
      }

      if (command === GAME_COMMAND.RESTART) {
        await locked.deleteRoundHistory();
      }

      const roundNumber = command === GAME_COMMAND.RESTART ? 1 : await locked.getNextRoundNumber();
      await locked.createRound(roundNumber, movieIds);
      await locked.setRoomStatus("playing");
      await locked.saveCommand(input.requestId, { command, payloadHash, filterHash, outcome: GAME_COMMAND_OUTCOME.STARTED });

      return { status: "completed", outcome: GAME_COMMAND_OUTCOME.STARTED, roomId: room.id };
    });
  }

  private hashPayload(command: GameCommand, input: GameCommandInput): string {
    return sha256Hex(JSON.stringify({ command, roomCode: input.roomCode }));
  }
}
