import { SystemClock, type Clock } from "@/lib/clock";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { RoomStatus } from "@/lib/rooms/room-service";
import { sha256Hex } from "@/lib/sha256";
import { RoundResolver, type LockedRoundResolution } from "@/lib/matches/round-resolver";

import type { BallotInput } from "@/lib/ballots/ballot-input";
import type { BallotVoteInput } from "@/lib/ballots/ballot-vote";

export type BallotRoom = {
  id: string;
  status: RoomStatus;
  expiresAt: Date;
};

export type LockedBallotParticipant = {
  id: string;
};

export type BallotReceipt = {
  roundId: string;
  payloadHash: string;
};

export type LockedVotingRound = {
  id: string;
  movieIds: number[];
};

export type BallotReceiptLookup = { requestId: string } | { roundId: string };

export type LockedBallotRoom = LockedRoundResolution & {
  findParticipant(accessTokenHash: string): Promise<LockedBallotParticipant | null>;
  findBallot(participantId: string, lookup: BallotReceiptLookup): Promise<BallotReceipt | null>;
  findVotingRound(): Promise<LockedVotingRound | null>;
  saveBallot(input: { participantId: string; roundId: string; requestId: string; payloadHash: string; votes: BallotVoteInput[] }): Promise<void>;
  countSubmittedBallots(roundId: string): Promise<number>;
};

export type BallotRepository = {
  inLockedRoom<T>(roomCode: string, operation: (room: BallotRoom | null, locked: LockedBallotRoom) => Promise<T>): Promise<T>;
};

export type BallotSubmissionResult =
  { status: "completed"; roomId: string; roundId: string; submittedCount: number } | { status: "unavailable" } | { status: "conflict" };

export class BallotService {
  constructor(
    private readonly repository: BallotRepository,
    private readonly clock: Clock = new SystemClock(),
    private readonly roundResolver: RoundResolver = new RoundResolver(),
  ) {}

  async submit(input: BallotInput, storedAccessToken: string | null): Promise<BallotSubmissionResult> {
    const accessTokenHash = hashStoredParticipantAccessToken(storedAccessToken);

    if (accessTokenHash === null) {
      return { status: "unavailable" };
    }

    const payloadHash = this.hashPayload(input);

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<BallotSubmissionResult> => {
      if (room === null || room.status === "closed" || room.expiresAt.getTime() <= this.clock.now().getTime()) {
        return { status: "unavailable" };
      }

      const participant = await locked.findParticipant(accessTokenHash);

      if (participant === null) {
        return { status: "unavailable" };
      }

      const previousBallot = await locked.findBallot(participant.id, { requestId: input.requestId });

      if (previousBallot !== null) {
        if (previousBallot.roundId !== input.roundId || previousBallot.payloadHash !== payloadHash) {
          return { status: "conflict" };
        }

        return this.completed(room.id, previousBallot.roundId, await locked.countSubmittedBallots(previousBallot.roundId));
      }

      if (room.status !== "playing") {
        return { status: "unavailable" };
      }

      const currentRound = await locked.findVotingRound();

      if (currentRound?.id !== input.roundId) {
        return { status: "unavailable" };
      }

      if (!this.hasExactMovieSet(input.votes, currentRound.movieIds)) {
        return { status: "unavailable" };
      }

      if ((await locked.findBallot(participant.id, { roundId: currentRound.id })) !== null) {
        return { status: "conflict" };
      }

      await locked.saveBallot({
        participantId: participant.id,
        roundId: currentRound.id,
        requestId: input.requestId,
        payloadHash,
        votes: input.votes,
      });

      await this.roundResolver.resolve(currentRound.id, locked);

      return this.completed(room.id, currentRound.id, await locked.countSubmittedBallots(currentRound.id));
    });
  }

  private completed(roomId: string, roundId: string, submittedCount: number): BallotSubmissionResult {
    return { status: "completed", roomId, roundId, submittedCount };
  }

  private hasExactMovieSet(votes: readonly BallotVoteInput[], movieIds: readonly number[]): boolean {
    if (votes.length !== 3 || movieIds.length !== 3) {
      return false;
    }

    const submittedMovieIds = new Set(votes.map(vote => vote.movieId));

    if (submittedMovieIds.size !== 3 || new Set(movieIds).size !== 3) {
      return false;
    }

    return movieIds.every(movieId => submittedMovieIds.has(movieId));
  }

  private hashPayload(input: BallotInput): string {
    const votes = [...input.votes].sort((left, right) => left.movieId - right.movieId).map(vote => ({ movieId: vote.movieId, value: vote.value }));

    return sha256Hex(JSON.stringify({ roomCode: input.roomCode, roundId: input.roundId, votes }));
  }
}
