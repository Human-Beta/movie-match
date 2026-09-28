import { SystemClock, type Clock } from "@/lib/clock";
import { assertNever } from "@/lib/assert-never";
import { GAME_COMMAND, GAME_COMMAND_OUTCOME, type GameCommand, type GameCommandOutcome } from "@/lib/game-rounds/game-command";
import { PARTICIPANT_ROLE, type ParticipantRole } from "@/lib/participants/participant-role";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { GameCommandInput } from "@/lib/game-rounds/game-command-input";
import { hashRoomFilterContract } from "@/lib/room-filters/filter-contract";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";
import { isRoomExpired } from "@/lib/rooms/room-expiration";
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

    return this.repository.inLockedRoom(input.roomCode, (room, locked) =>
      this.executeLocked(command, input, accessTokenHash, payloadHash, room, locked),
    );
  }

  private async executeLocked(
    command: GameCommand,
    input: GameCommandInput,
    accessTokenHash: string,
    payloadHash: string,
    room: GameRoom | null,
    locked: LockedGameRoom,
  ): Promise<GameCommandResult> {
    if (room === null || isRoomExpired(room.expiresAt, this.clock.now())) {
      return { status: "unavailable" };
    }

    if ((await locked.findParticipantRole(accessTokenHash)) !== PARTICIPANT_ROLE.HOST) {
      return { status: "unavailable" };
    }

    const replay = await this.findReplayResult(command, input.requestId, payloadHash, room, locked);

    if (replay !== null) {
      return replay;
    }

    switch (command) {
      case GAME_COMMAND.CLOSE:
        return this.closeMatchedRoom(input.requestId, payloadHash, room, locked);
      case GAME_COMMAND.SEARCH_AGAIN:
        return this.executeSearchAgain(input.requestId, payloadHash, room, locked);
      case GAME_COMMAND.START:
      case GAME_COMMAND.RESTART:
        return this.startOrRestart(command, input.requestId, payloadHash, room, locked);
      default:
        return assertNever(command);
    }
  }

  private async findReplayResult(
    command: GameCommand,
    requestId: string,
    payloadHash: string,
    room: GameRoom,
    locked: LockedGameRoom,
  ): Promise<GameCommandResult | null> {
    const previousCommand = await locked.findCommand(requestId);

    if (previousCommand === null) {
      return null;
    }

    if (previousCommand.payloadHash !== payloadHash || previousCommand.command !== command) {
      return { status: "conflict" };
    }

    return { status: "completed", outcome: previousCommand.outcome, roomId: room.id };
  }

  private async closeMatchedRoom(requestId: string, payloadHash: string, room: GameRoom, locked: LockedGameRoom): Promise<GameCommandResult> {
    if (room.status !== "matched") {
      return { status: "unavailable" };
    }

    await locked.setRoomStatus("closed");
    await locked.saveCommand(requestId, {
      command: GAME_COMMAND.CLOSE,
      payloadHash,
      filterHash: EMPTY_FILTER_HASH,
      outcome: GAME_COMMAND_OUTCOME.CLOSED,
    });

    return { status: "completed", outcome: GAME_COMMAND_OUTCOME.CLOSED, roomId: room.id };
  }

  private async executeSearchAgain(requestId: string, payloadHash: string, room: GameRoom, locked: LockedGameRoom): Promise<GameCommandResult> {
    if (room.status !== "matched" || !(await locked.hasCurrentMatchedRoundSelectedMovie())) {
      return { status: "unavailable" };
    }

    const filters = await locked.readFilters();
    const filterHash = hashRoomFilterContract(filters);
    const movieIds = [...new Set(await locked.selectEligibleMovieIds(filters, true))];

    if (!isMovieIdTriplet(movieIds)) {
      await locked.setRoomStatus("exhausted");
      await locked.saveCommand(requestId, {
        command: GAME_COMMAND.SEARCH_AGAIN,
        payloadHash,
        filterHash,
        outcome: GAME_COMMAND_OUTCOME.LIST_EXHAUSTED,
      });

      return { status: "completed", outcome: GAME_COMMAND_OUTCOME.LIST_EXHAUSTED, roomId: room.id };
    }

    await locked.createRound(await locked.getNextRoundNumber(), movieIds);
    await locked.setRoomStatus("playing");
    await locked.saveCommand(requestId, {
      command: GAME_COMMAND.SEARCH_AGAIN,
      payloadHash,
      filterHash,
      outcome: GAME_COMMAND_OUTCOME.STARTED,
    });

    return { status: "completed", outcome: GAME_COMMAND_OUTCOME.STARTED, roomId: room.id };
  }

  private async startOrRestart(
    command: typeof GAME_COMMAND.START | typeof GAME_COMMAND.RESTART,
    requestId: string,
    payloadHash: string,
    room: GameRoom,
    locked: LockedGameRoom,
  ): Promise<GameCommandResult> {
    if (command === GAME_COMMAND.START && (room.status !== "waiting" || (await locked.countParticipants()) !== 2)) {
      return { status: "unavailable" };
    }

    if (command === GAME_COMMAND.RESTART && room.status !== "exhausted") {
      return { status: "unavailable" };
    }

    const filters = await locked.readFilters();
    const filterHash = hashRoomFilterContract(filters);
    const movieIds = [...new Set(await locked.selectEligibleMovieIds(filters, command === GAME_COMMAND.START))];

    if (!isMovieIdTriplet(movieIds)) {
      return this.saveInsufficientOutcome(command, requestId, payloadHash, filters, filterHash, movieIds, room, locked);
    }

    if (command === GAME_COMMAND.RESTART) {
      await locked.deleteRoundHistory();
    }

    const roundNumber = command === GAME_COMMAND.RESTART ? 1 : await locked.getNextRoundNumber();
    await locked.createRound(roundNumber, movieIds);
    await locked.setRoomStatus("playing");
    await locked.saveCommand(requestId, {
      command,
      payloadHash,
      filterHash,
      outcome: GAME_COMMAND_OUTCOME.STARTED,
    });

    return { status: "completed", outcome: GAME_COMMAND_OUTCOME.STARTED, roomId: room.id };
  }

  private async saveInsufficientOutcome(
    command: typeof GAME_COMMAND.START | typeof GAME_COMMAND.RESTART,
    requestId: string,
    payloadHash: string,
    filters: RoomFilterValues,
    filterHash: string,
    movieIds: number[],
    room: GameRoom,
    locked: LockedGameRoom,
  ): Promise<GameCommandResult> {
    const fullCatalogMovieIds = command === GAME_COMMAND.RESTART ? movieIds : [...new Set(await locked.selectEligibleMovieIds(filters, false))];
    const outcome = isMovieIdTriplet(fullCatalogMovieIds) ? GAME_COMMAND_OUTCOME.LIST_EXHAUSTED : GAME_COMMAND_OUTCOME.CATALOG_INSUFFICIENT;

    if (outcome === GAME_COMMAND_OUTCOME.LIST_EXHAUSTED) {
      await locked.setRoomStatus("exhausted");
    }

    await locked.saveCommand(requestId, { command, payloadHash, filterHash, outcome });

    return { status: "completed", outcome, roomId: room.id };
  }

  private hashPayload(command: GameCommand, input: GameCommandInput): string {
    return sha256Hex(JSON.stringify({ command, roomCode: input.roomCode }));
  }
}
