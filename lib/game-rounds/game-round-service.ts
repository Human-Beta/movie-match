import { createHash } from "node:crypto";

import { SystemClock, type Clock } from "@/lib/clock";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { GameCommandInput } from "@/lib/game-rounds/game-command-input";
import { hashRoomFilterContract } from "@/lib/room-filters/filter-contract";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type GameCommand = "start" | "restart";
export type GameCommandOutcome = "started" | "catalog_insufficient" | "list_exhausted";

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
  selectEligibleMovieIds(filters: RoomFilterValues, excludeSeen: boolean): Promise<number[]>;
  getNextRoundNumber(): Promise<number>;
  deleteRoundHistory(): Promise<void>;
  createRound(roundNumber: number, movieIds: readonly [number, number, number]): Promise<void>;
  setRoomStatus(status: "waiting" | "playing" | "exhausted"): Promise<void>;
  saveCommand(requestId: string, receipt: GameCommandReceipt): Promise<void>;
};

export type GameRoundRepository = {
  inLockedRoom<T>(roomCode: string, operation: (room: GameRoom | null, locked: LockedGameRoom) => Promise<T>): Promise<T>;
};

export type GameCommandResult =
  { status: "completed"; outcome: GameCommandOutcome; roomId: string } | { status: "unavailable" } | { status: "conflict" };

type MovieIdTriplet = readonly [number, number, number];

function isMovieIdTriplet(movieIds: readonly number[]): movieIds is MovieIdTriplet {
  return movieIds.length === 3;
}

export class GameRoundService {
  constructor(
    private readonly repository: GameRoundRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  start(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute("start", input, storedAccessToken);
  }

  restart(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    return this.execute("restart", input, storedAccessToken);
  }

  private async execute(command: GameCommand, input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (accessTokenHash === null) {
      return { status: "unavailable" };
    }

    const payloadHash = this.hashPayload(command, input);

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<GameCommandResult> => {
      if (room === null || room.status === "closed" || room.expiresAt.getTime() <= this.clock.now().getTime()) {
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

      if (command === "start") {
        if (room.status !== "waiting" || (await locked.countParticipants()) !== 2) {
          return { status: "unavailable" };
        }
      } else if (room.status !== "exhausted") {
        return { status: "unavailable" };
      }

      const filters = await locked.readFilters();
      const filterHash = hashRoomFilterContract(filters);
      const movieIds = [...new Set(await locked.selectEligibleMovieIds(filters, command === "start"))];

      if (!isMovieIdTriplet(movieIds)) {
        const fullCatalogMovieIds = command === "restart" ? movieIds : [...new Set(await locked.selectEligibleMovieIds(filters, false))];
        const outcome: GameCommandOutcome = isMovieIdTriplet(fullCatalogMovieIds) ? "list_exhausted" : "catalog_insufficient";
        if (outcome === "list_exhausted") {
          await locked.setRoomStatus("exhausted");
        }
        await locked.saveCommand(input.requestId, { command, payloadHash, filterHash, outcome });

        return { status: "completed", outcome, roomId: room.id };
      }

      if (command === "restart") {
        await locked.deleteRoundHistory();
      }

      const roundNumber = command === "restart" ? 1 : await locked.getNextRoundNumber();
      await locked.createRound(roundNumber, movieIds);
      await locked.setRoomStatus("playing");
      await locked.saveCommand(input.requestId, { command, payloadHash, filterHash, outcome: "started" });

      return { status: "completed", outcome: "started", roomId: room.id };
    });
  }

  private hashPayload(command: GameCommand, input: GameCommandInput): string {
    return createHash("sha256")
      .update(JSON.stringify({ command, roomCode: input.roomCode }))
      .digest("hex");
  }
}
