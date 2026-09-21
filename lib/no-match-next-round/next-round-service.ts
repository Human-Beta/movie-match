import { SystemClock, type Clock } from "@/lib/clock";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";
import { NO_MATCH_NEXT_ROUND_OUTCOME, type NoMatchNextRoundOutcome } from "@/lib/no-match-next-round/next-round-outcome";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { ParticipantRole } from "@/lib/participants/participant-role";
import { sha256Hex } from "@/lib/sha256";

import type { NextRoundInput } from "@/lib/no-match-next-round/next-round-input";

export type { NoMatchNextRoundOutcome } from "@/lib/no-match-next-round/next-round-outcome";

export type NoMatchNextRoundRoom = {
  id: string;
  status: RoomStatus;
  expiresAt: Date;
};

export type NoMatchParticipant = { id: string; role: ParticipantRole };

export type NoMatchReadinessReceipt = {
  roundId: string;
  requestId: string;
  payloadHash: string;
  outcome: NoMatchNextRoundOutcome;
};

export type LockedNoMatchRoom = {
  findParticipant(accessTokenHash: string): Promise<NoMatchParticipant | null>;
  findReadinessByRequest(participantId: string, requestId: string): Promise<NoMatchReadinessReceipt | null>;
  findReadiness(participantId: string, roundId: string): Promise<NoMatchReadinessReceipt | null>;
  isCurrentNoMatchRound(roundId: string): Promise<boolean>;
  saveReadiness(receipt: NoMatchReadinessReceipt & { participantId: string }): Promise<void>;
  setReadinessOutcome(
    participantId: string,
    roundId: string,
    outcome: Exclude<NoMatchNextRoundOutcome, typeof NO_MATCH_NEXT_ROUND_OUTCOME.READY>,
  ): Promise<void>;
  countReadiness(roundId: string): Promise<number>;
  readFilters(): Promise<RoomFilterValues>;
  selectEligibleMovieIds(filters: RoomFilterValues): Promise<number[]>;
  getNextRoundNumber(): Promise<number>;
  createRound(roundNumber: number, movieIds: readonly [number, number, number]): Promise<void>;
  setRoomStatus(status: "playing" | "exhausted"): Promise<void>;
};

export type NoMatchNextRoundRepository = {
  inLockedRoom<T>(roomCode: string, operation: (room: NoMatchNextRoundRoom | null, locked: LockedNoMatchRoom) => Promise<T>): Promise<T>;
};

export type NoMatchNextRoundResult =
  { status: "completed"; roomId: string; outcome: NoMatchNextRoundOutcome } | { status: "unavailable" } | { status: "conflict" };

type MovieIdTriplet = readonly [number, number, number];

function isMovieIdTriplet(movieIds: readonly number[]): movieIds is MovieIdTriplet {
  return movieIds.length === 3 && new Set(movieIds).size === 3;
}

export class NoMatchNextRoundService {
  constructor(
    private readonly repository: NoMatchNextRoundRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async confirm(input: NextRoundInput, storedAccessToken: string | null): Promise<NoMatchNextRoundResult> {
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (accessTokenHash === null) {
      return { status: "unavailable" };
    }

    const payloadHash = sha256Hex(JSON.stringify({ roomCode: input.roomCode, roundId: input.roundId }));

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<NoMatchNextRoundResult> => {
      if (room?.status !== "playing" || room.expiresAt.getTime() <= this.clock.now().getTime()) {
        return { status: "unavailable" };
      }

      const participant = await locked.findParticipant(accessTokenHash);

      if (participant === null) {
        return { status: "unavailable" };
      }

      const replay = await locked.findReadinessByRequest(participant.id, input.requestId);

      if (replay !== null) {
        if (replay.roundId !== input.roundId || replay.payloadHash !== payloadHash) {
          return { status: "conflict" };
        }
        return { status: "completed", roomId: room.id, outcome: replay.outcome };
      }

      const existingReadiness = await locked.findReadiness(participant.id, input.roundId);

      if (existingReadiness !== null) {
        return { status: "completed", roomId: room.id, outcome: existingReadiness.outcome };
      }

      if (!(await locked.isCurrentNoMatchRound(input.roundId))) {
        return { status: "unavailable" };
      }

      await locked.saveReadiness({
        participantId: participant.id,
        roundId: input.roundId,
        requestId: input.requestId,
        payloadHash,
        outcome: NO_MATCH_NEXT_ROUND_OUTCOME.READY,
      });

      if ((await locked.countReadiness(input.roundId)) !== 2) {
        return { status: "completed", roomId: room.id, outcome: NO_MATCH_NEXT_ROUND_OUTCOME.READY };
      }

      const movieIds = await locked.selectEligibleMovieIds(await locked.readFilters());

      if (!isMovieIdTriplet(movieIds)) {
        await locked.setRoomStatus("exhausted");
        await locked.setReadinessOutcome(participant.id, input.roundId, NO_MATCH_NEXT_ROUND_OUTCOME.LIST_EXHAUSTED);
        return { status: "completed", roomId: room.id, outcome: NO_MATCH_NEXT_ROUND_OUTCOME.LIST_EXHAUSTED };
      }

      await locked.createRound(await locked.getNextRoundNumber(), movieIds);
      await locked.setRoomStatus("playing");
      await locked.setReadinessOutcome(participant.id, input.roundId, NO_MATCH_NEXT_ROUND_OUTCOME.STARTED);

      return { status: "completed", roomId: room.id, outcome: NO_MATCH_NEXT_ROUND_OUTCOME.STARTED };
    });
  }
}
