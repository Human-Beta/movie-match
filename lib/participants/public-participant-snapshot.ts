import type { BallotVoteInput } from "@/lib/ballots/ballot-vote";
import type { ParticipantRole } from "@/lib/participants/participant-service";
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

export type PublicRoomRound = {
  roundId: string;
  roundNumber: number;
  status: "voting" | "matched" | "no_match";
  movies: PublicRoomMovies;
};

export type PublicBallotProgress = {
  submittedCount: number;
  totalParticipants: number;
  readyForResults: boolean;
};

export type ParticipantOwnBallot = { status: "not_submitted"; votes: [] } | { status: "submitted"; votes: BallotVoteInput[] };

export type PublicParticipantSnapshot = {
  roomState: RoomStatus;
  participantCount: number;
  participants: PublicRoomParticipant[];
  currentRound: PublicRoomRound | null;
  ballotProgress: PublicBallotProgress | null;
};

export type ParticipantClientSnapshot = PublicParticipantSnapshot & {
  ownBallot: ParticipantOwnBallot | null;
};

export type ParticipantClientRoomState = {
  realtimeTopic: string;
  snapshot: ParticipantClientSnapshot;
};

export type ParticipantSnapshotActionResult<TSnapshot extends PublicParticipantSnapshot = PublicParticipantSnapshot> =
  { status: "ready"; snapshot: TSnapshot } | { status: "unavailable" } | { status: "error" };
