import { assertNever } from "@/lib/assert-never";
import type { VoteValue } from "@/lib/ballots/ballot-vote";
import { ROUND_STATUS, type MatchedRoundStatus, type NoMatchRoundStatus, type RoundStatus } from "@/lib/game-rounds/round-status";
import { isPair, type Pair } from "@/lib/pair";

export type PersistedRoundResolutionMovie = {
  movieId: number;
  isSelected: boolean;
};

export type PersistedRoundResolutionBallot = {
  participantId: string;
};

export type PersistedRoundResolutionVote = {
  participantId: string;
  movieId: number;
  value: VoteValue;
};

export type PersistedRoundResolutionState = {
  status: RoundStatus;
  movies: PersistedRoundResolutionMovie[];
  ballots: PersistedRoundResolutionBallot[];
  votes: PersistedRoundResolutionVote[];
};

export type RoundResolution = { status: MatchedRoundStatus; selectedMovieId: number } | { status: NoMatchRoundStatus; selectedMovieId: null };

type CalculatedRoundResolution = { status: MatchedRoundStatus; candidateMovieIds: number[] } | { status: NoMatchRoundStatus; selectedMovieId: null };

export type LockedRoundResolution = {
  readRoundResolution(roundId: string): Promise<PersistedRoundResolutionState | null>;
  persistRoundResolution(roundId: string, resolution: RoundResolution): Promise<void>;
};

export type RoundWinnerChooser = (movieIds: readonly number[]) => number;

export class RoundResolutionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoundResolutionInvariantError";
  }
}

function chooseRandomMovie(movieIds: readonly number[]): number {
  const winner = movieIds.at(Math.floor(Math.random() * movieIds.length));

  if (winner === undefined) {
    throw new RoundResolutionInvariantError("Cannot choose a winner from an empty match set.");
  }

  return winner;
}

function positiveStrength(value: VoteValue): number {
  switch (value) {
    case "want_to_watch":
      return 2;
    case "could_watch":
      return 1;
    case "not_now":
    case "no":
      return 0;
    default:
      return assertNever(value);
  }
}

export class RoundResolver {
  constructor(private readonly chooseWinner: RoundWinnerChooser = chooseRandomMovie) {}

  async resolve(roundId: string, locked: LockedRoundResolution): Promise<RoundResolution | null> {
    const state = await locked.readRoundResolution(roundId);

    if (state === null) {
      throw new RoundResolutionInvariantError("The locked round is missing.");
    }

    switch (state.status) {
      case ROUND_STATUS.VOTING:
        return this.resolveVotingRound(roundId, state, locked);
      case ROUND_STATUS.MATCHED:
      case ROUND_STATUS.NO_MATCH:
        return this.readTerminalRound(state);
      default:
        return assertNever(state.status);
    }
  }

  private async resolveVotingRound(
    roundId: string,
    state: PersistedRoundResolutionState,
    locked: LockedRoundResolution,
  ): Promise<RoundResolution | null> {
    const submittedParticipantIds = this.validateSubmittedBallots(state);

    if (state.movies.some(movie => movie.isSelected)) {
      throw new RoundResolutionInvariantError("A voting round cannot already have a selected movie.");
    }

    if (submittedParticipantIds.length < 2) {
      return null;
    }

    const calculated = this.calculateResolution(state, submittedParticipantIds);
    const resolution: RoundResolution =
      calculated.status === ROUND_STATUS.NO_MATCH
        ? calculated
        : { status: ROUND_STATUS.MATCHED, selectedMovieId: this.chooseCandidate(calculated.candidateMovieIds) };
    await locked.persistRoundResolution(roundId, resolution);

    return resolution;
  }

  private readTerminalRound(state: PersistedRoundResolutionState): RoundResolution {
    const submittedParticipantIds = this.validateSubmittedBallots(state);

    if (submittedParticipantIds.length !== 2) {
      throw new RoundResolutionInvariantError("A terminal round must have exactly two completed ballots.");
    }

    const calculated = this.calculateResolution(state, submittedParticipantIds);
    const selectedMovieIds = state.movies.filter(movie => movie.isSelected).map(movie => movie.movieId);

    switch (state.status) {
      case ROUND_STATUS.MATCHED: {
        if (calculated.status !== ROUND_STATUS.MATCHED || selectedMovieIds.length !== 1 || selectedMovieIds[0] === undefined) {
          throw new RoundResolutionInvariantError("The matched round does not contain one valid persisted winner.");
        }

        if (!calculated.candidateMovieIds.includes(selectedMovieIds[0])) {
          throw new RoundResolutionInvariantError("The persisted winner is not one of the strongest matches.");
        }

        return { status: ROUND_STATUS.MATCHED, selectedMovieId: selectedMovieIds[0] };
      }
      case ROUND_STATUS.NO_MATCH:
        if (calculated.status !== ROUND_STATUS.NO_MATCH || selectedMovieIds.length !== 0) {
          throw new RoundResolutionInvariantError("The no-match round contains an invalid persisted winner.");
        }

        return { status: ROUND_STATUS.NO_MATCH, selectedMovieId: null };
      case ROUND_STATUS.VOTING:
        throw new RoundResolutionInvariantError("A terminal round cannot be voting.");
      default:
        return assertNever(state.status);
    }
  }

  private validateSubmittedBallots(state: PersistedRoundResolutionState): string[] {
    if (state.movies.length !== 3 || new Set(state.movies.map(movie => movie.movieId)).size !== 3) {
      throw new RoundResolutionInvariantError("A round must contain exactly three distinct movies.");
    }

    const participantIds = state.ballots.map(ballot => ballot.participantId);

    if (new Set(participantIds).size !== participantIds.length || participantIds.length > 2) {
      throw new RoundResolutionInvariantError("A round cannot contain duplicate or more than two ballot markers.");
    }

    const expectedVoteCount = participantIds.length * state.movies.length;

    if (state.votes.length !== expectedVoteCount) {
      throw new RoundResolutionInvariantError("Ballot markers and persisted votes are inconsistent.");
    }

    const movieIds = new Set(state.movies.map(movie => movie.movieId));
    const participantIdSet = new Set(participantIds);
    const voteKeys = new Set<string>();
    const voteCountByParticipant = new Map<string, number>();
    const voteCountByMovie = new Map<number, number>();

    for (const vote of state.votes) {
      const voteKey = `${vote.participantId}:${vote.movieId}`;

      if (!participantIdSet.has(vote.participantId) || !movieIds.has(vote.movieId) || voteKeys.has(voteKey)) {
        throw new RoundResolutionInvariantError("A persisted vote does not belong to the completed ballots and round movies.");
      }

      voteKeys.add(voteKey);
      voteCountByParticipant.set(vote.participantId, (voteCountByParticipant.get(vote.participantId) ?? 0) + 1);
      voteCountByMovie.set(vote.movieId, (voteCountByMovie.get(vote.movieId) ?? 0) + 1);
    }

    for (const participantId of participantIds) {
      if (voteCountByParticipant.get(participantId) !== 3) {
        throw new RoundResolutionInvariantError("A completed ballot must contain one vote for every round movie.");
      }
    }

    for (const movieId of movieIds) {
      if (voteCountByMovie.get(movieId) !== participantIds.length) {
        throw new RoundResolutionInvariantError("A round movie does not have the expected number of votes.");
      }
    }

    return participantIds;
  }

  private calculateResolution(state: PersistedRoundResolutionState, participantIds: readonly string[]): CalculatedRoundResolution {
    if (participantIds.length !== 2) {
      throw new RoundResolutionInvariantError("Match calculation requires exactly two completed ballots.");
    }

    const candidateMovieIds: number[] = [];
    let strongestMatch = 0;

    for (const movie of state.movies) {
      const movieVotes = state.votes.filter(vote => vote.movieId === movie.movieId);

      if (!isPair(movieVotes)) {
        throw new RoundResolutionInvariantError("A resolved movie must have two votes.");
      }

      const strengths: Pair<number> = [positiveStrength(movieVotes[0].value), positiveStrength(movieVotes[1].value)];

      // A high vote alone is never a match: both participants must be positive.
      if (strengths.some(strength => strength === 0)) {
        continue;
      }

      const [firstStrength, secondStrength] = strengths;
      const strength = firstStrength + secondStrength;

      if (strength > strongestMatch) {
        strongestMatch = strength;
        candidateMovieIds.splice(0, candidateMovieIds.length, movie.movieId);
      } else if (strength === strongestMatch) {
        candidateMovieIds.push(movie.movieId);
      }
    }

    if (candidateMovieIds.length === 0) {
      return { status: ROUND_STATUS.NO_MATCH, selectedMovieId: null };
    }

    return { status: ROUND_STATUS.MATCHED, candidateMovieIds };
  }

  private chooseCandidate(candidateMovieIds: readonly number[]): number {
    const selectedMovieId = this.chooseWinner(candidateMovieIds);

    if (!candidateMovieIds.includes(selectedMovieId)) {
      throw new RoundResolutionInvariantError("The winner chooser returned a movie outside the strongest match set.");
    }

    return selectedMovieId;
  }
}
