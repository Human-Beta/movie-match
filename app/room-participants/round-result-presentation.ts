import { assertNever } from "@/lib/assert-never";
import { ROUND_STATUS, isTerminalRoundStatus, type TerminalRoundStatus } from "@/lib/game-rounds/round-status";
import type { PublicRoomMovie, PublicRoomRound, PublicRoundResult } from "@/lib/participants/public-participant-snapshot";

export type TerminalRoundPresentation = {
  key: string;
  result: PublicRoundResult;
  round: PublicRoomRound;
  selectedMovie: PublicRoomMovie | null;
  status: TerminalRoundStatus;
};

export function getTerminalRoundPresentation(round: PublicRoomRound | null): TerminalRoundPresentation | null {
  const result = round?.result;

  if (round === null || !isTerminalRoundStatus(round.status) || result === undefined) {
    return null;
  }

  switch (round.status) {
    case ROUND_STATUS.MATCHED: {
      if (result.status !== ROUND_STATUS.MATCHED) {
        return null;
      }

      const selectedMovie = round.movies.find(movie => movie.movieId === result.selectedMovieId) ?? null;

      if (selectedMovie === null) {
        return null;
      }

      return {
        key: createTerminalRoundPresentationKey(round.roundId, round.status),
        result,
        round,
        selectedMovie,
        status: round.status,
      };
    }
    case ROUND_STATUS.NO_MATCH:
      if (result.status !== ROUND_STATUS.NO_MATCH) {
        return null;
      }

      return {
        key: createTerminalRoundPresentationKey(round.roundId, round.status),
        result,
        round,
        selectedMovie: null,
        status: round.status,
      };
    default:
      return assertNever(round.status);
  }
}

export function createTerminalRoundPresentationKey(roundId: string, status: TerminalRoundStatus): string {
  return `${roundId}:${status}`;
}
