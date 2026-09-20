import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomMovie, PublicRoomRound, PublicRoundMovieVotes } from "@/lib/participants/public-participant-snapshot";

const MATCH_FINAL_MESSAGE_KEYS = ["agreementIsMiracle", "putThePhoneDown", "scrollingLost", "theListCanRest", "decisionMade"] as const;

export type MatchFinalMessageKey = (typeof MATCH_FINAL_MESSAGE_KEYS)[number];

export type MatchPresentation = {
  finalMessageKey: MatchFinalMessageKey;
  selectedMovie: PublicRoomMovie;
  selectedVotes: PublicRoundMovieVotes;
};

export function getMatchPresentation(round: PublicRoomRound): MatchPresentation | null {
  const result = round.result;

  if (round.status !== ROUND_STATUS.MATCHED || result === undefined || result.status !== ROUND_STATUS.MATCHED) {
    return null;
  }

  const selectedMovie = round.movies.find(movie => movie.movieId === result.selectedMovieId) ?? null;
  const selectedVotes = result.movieVotes.find(movieVotes => movieVotes.movieId === result.selectedMovieId) ?? null;

  if (selectedMovie === null || selectedVotes === null) {
    return null;
  }

  return {
    finalMessageKey: getMatchFinalMessageKey(round.roundId),
    selectedMovie,
    selectedVotes,
  };
}

export function getMatchFinalMessageKey(roundId: string): MatchFinalMessageKey {
  let hash = 0;

  for (let index = 0; index < roundId.length; index += 1) {
    hash = (hash * 31 + roundId.charCodeAt(index)) >>> 0;
  }

  return MATCH_FINAL_MESSAGE_KEYS[hash % MATCH_FINAL_MESSAGE_KEYS.length] ?? MATCH_FINAL_MESSAGE_KEYS[0];
}
