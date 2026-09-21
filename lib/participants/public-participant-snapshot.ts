import type { BallotVoteInput, VoteValue } from "@/lib/ballots/ballot-vote";
import type { MatchedRoundStatus, NoMatchRoundStatus, RoundStatus } from "@/lib/game-rounds/round-status";
import type { Pair } from "@/lib/pair";
import type { ParticipantRole } from "@/lib/participants/participant-role";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type PublicRoomParticipant = {
  name: string;
  role: ParticipantRole;
};

export type PublicRoomMovie = {
  movieId: number;
  position: number;
  title: string;
  posterPath: string | null;
  releaseYear: number;
  runtimeMinutes: number;
  genres: string[];
};

export type PublicRoomMovies = readonly [PublicRoomMovie, PublicRoomMovie, PublicRoomMovie];

export function isPublicRoomMovies(movies: readonly PublicRoomMovie[]): movies is PublicRoomMovies {
  return movies.length === 3 && movies.every((movie, index) => movie.position === index + 1);
}

export type PublicRoundVote = {
  role: ParticipantRole;
  value: VoteValue;
};

export type PublicRoundMovieVotes = {
  movieId: number;
  votes: Pair<PublicRoundVote>;
};

export type PublicRoundMovieVoteSet = readonly [PublicRoundMovieVotes, PublicRoundMovieVotes, PublicRoundMovieVotes];

export type PublicRoundResult =
  | { status: MatchedRoundStatus; selectedMovieId: number; movieVotes: PublicRoundMovieVoteSet }
  | { status: NoMatchRoundStatus; selectedMovieId: null; movieVotes: PublicRoundMovieVoteSet };

export type PublicRoomRound = {
  roundId: string;
  roundNumber: number;
  status: RoundStatus;
  movies: PublicRoomMovies;
  result?: PublicRoundResult;
};

export type PublicBallotProgress = {
  submittedCount: number;
  totalParticipants: number;
  readyForResults: boolean;
};

export type PublicNoMatchReadiness = {
  readyCount: number;
  totalParticipants: number;
};

export type ParticipantNoMatchReadiness = PublicNoMatchReadiness & { ownReady: boolean };

export type ParticipantOwnBallot = { status: "not_submitted"; votes: [] } | { status: "submitted"; votes: BallotVoteInput[] };

export type PublicParticipantSnapshot = {
  roomState: RoomStatus;
  participantCount: number;
  participants: PublicRoomParticipant[];
  currentRound: PublicRoomRound | null;
  ballotProgress: PublicBallotProgress | null;
  noMatchReadiness?: PublicNoMatchReadiness;
};

export type ParticipantClientSnapshot = Omit<PublicParticipantSnapshot, "noMatchReadiness"> & {
  ownBallot: ParticipantOwnBallot | null;
  noMatchReadiness?: ParticipantNoMatchReadiness;
};

export type ParticipantClientRoomState = {
  realtimeTopic: string;
  snapshot: ParticipantClientSnapshot;
};

export type ParticipantSnapshotActionResult<TSnapshot extends PublicParticipantSnapshot = PublicParticipantSnapshot> =
  { status: "ready"; snapshot: TSnapshot } | { status: "unavailable" } | { status: "error" };
