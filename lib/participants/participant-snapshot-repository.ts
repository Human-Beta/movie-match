import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { assertNever } from "@/lib/assert-never";
import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { genres, movieGenres, movies, participants, roundBallots, rooms, roundMovies, rounds, votes } from "@/lib/db/schema";
import type { VoteValue } from "@/lib/ballots/ballot-vote";
import { isTerminalRoundStatus, ROUND_STATUS, type TerminalRoundStatus } from "@/lib/game-rounds/round-status";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import {
  isPublicRoomMovies,
  type ParticipantOwnBallot,
  type PublicRoundMovieVoteSet,
  type PublicRoundMovieVotes,
  type PublicRoundResult,
  type PublicRoundVote,
  type PublicRoomMovie,
} from "@/lib/participants/public-participant-snapshot";
import type { ParticipantSnapshotRecord, ParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-service";
import { isPair } from "@/lib/pair";

export class DrizzleParticipantSnapshotRepository implements ParticipantSnapshotRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async findByRoomCode(roomCode: string): Promise<ParticipantSnapshotRecord | null> {
    return this.findSnapshot(eq(rooms.code, roomCode));
  }

  async findByRoomId(roomId: string): Promise<ParticipantSnapshotRecord | null> {
    return this.findSnapshot(eq(rooms.id, roomId));
  }

  async findByRoomIdForParticipant(roomId: string, accessTokenHash: string): Promise<ParticipantSnapshotRecord | null> {
    return this.findSnapshot(eq(rooms.id, roomId), accessTokenHash);
  }

  private async findSnapshot(condition: SQL, accessTokenHash: string | null = null): Promise<ParticipantSnapshotRecord | null> {
    const database = await this.getDatabase();
    return database.transaction(
      async transaction => {
        const roomRows = await transaction
          .select({
            id: rooms.id,
            code: rooms.code,
            status: rooms.status,
            expiresAt: rooms.expiresAt,
          })
          .from(rooms)
          .where(condition)
          .limit(1);
        const room = roomRows.at(0) ?? null;

        if (room === null) {
          return null;
        }

        const ownParticipantRows =
          accessTokenHash === null
            ? []
            : await transaction
                .select({ id: participants.id })
                .from(participants)
                .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
                .limit(1);

        if (accessTokenHash !== null && ownParticipantRows.length === 0) {
          return null;
        }

        const participantRows = await transaction
          .select({ name: participants.name, role: participants.role })
          .from(participants)
          .where(eq(participants.roomId, room.id));
        const roundRows = await transaction
          .select({ id: rounds.id, roundNumber: rounds.roundNumber, status: rounds.status })
          .from(rounds)
          .where(eq(rounds.roomId, room.id))
          .orderBy(desc(rounds.roundNumber))
          .limit(1);
        const currentRound = roundRows.at(0) ?? null;

        if (currentRound === null) {
          return { room, participants: participantRows, currentRound: null, submittedBallotCount: 0, ownBallot: null };
        }

        const submittedBallotCountRows = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(roundBallots)
          .where(and(eq(roundBallots.roomId, room.id), eq(roundBallots.roundId, currentRound.id)));
        const submittedBallotCount = submittedBallotCountRows.at(0)?.count ?? 0;
        const ownParticipant = ownParticipantRows.at(0) ?? null;
        const ownBallotRows =
          ownParticipant === null
            ? []
            : await transaction
                .select({ requestId: roundBallots.requestId })
                .from(roundBallots)
                .where(
                  and(eq(roundBallots.roomId, room.id), eq(roundBallots.roundId, currentRound.id), eq(roundBallots.participantId, ownParticipant.id)),
                )
                .limit(1);
        let ownBallot: ParticipantOwnBallot | null = null;

        if (ownParticipant !== null) {
          if (ownBallotRows.length === 0) {
            ownBallot = { status: "not_submitted", votes: [] };
          } else {
            ownBallot = {
              status: "submitted",
              votes: await transaction
                .select({ movieId: votes.movieId, value: votes.value })
                .from(votes)
                .where(and(eq(votes.roomId, room.id), eq(votes.roundId, currentRound.id), eq(votes.participantId, ownParticipant.id)))
                .orderBy(asc(votes.movieId)),
            };
          }
        }

        const movieRows = await transaction
          .select({
            movieId: movies.id,
            position: roundMovies.position,
            title: movies.title,
            posterPath: movies.posterPath,
            releaseYear: movies.releaseYear,
            runtimeMinutes: movies.runtimeMinutes,
            genre: genres.name,
            isSelected: roundMovies.isSelected,
          })
          .from(roundMovies)
          .innerJoin(movies, eq(movies.id, roundMovies.movieId))
          .leftJoin(movieGenres, eq(movieGenres.movieId, movies.id))
          .leftJoin(genres, eq(genres.id, movieGenres.genreId))
          .where(eq(roundMovies.roundId, currentRound.id))
          .orderBy(asc(roundMovies.position), asc(genres.name));
        const moviesById = new Map<number, (typeof movieRows)[number] & { genres: string[] }>();

        for (const row of movieRows) {
          const existingMovie = moviesById.get(row.movieId);

          if (existingMovie) {
            if (row.genre !== null) {
              existingMovie.genres.push(row.genre);
            }
            continue;
          }

          moviesById.set(row.movieId, {
            ...row,
            genres: row.genre === null ? [] : [row.genre],
          });
        }

        const publicMovies: PublicRoomMovie[] = [...moviesById.values()].map(movie => ({
          movieId: movie.movieId,
          position: movie.position,
          title: movie.title,
          posterPath: movie.posterPath,
          releaseYear: movie.releaseYear,
          runtimeMinutes: movie.runtimeMinutes,
          genres: movie.genres,
        }));

        if (!isPublicRoomMovies(publicMovies)) {
          throw new Error("The current round must contain three movies in positions 1 through 3.");
        }

        const result = isTerminalRoundStatus(currentRound.status)
          ? this.toTerminalResult(
              currentRound.status,
              publicMovies,
              movieRows,
              await transaction
                .select({ movieId: votes.movieId, role: participants.role, value: votes.value })
                .from(votes)
                .innerJoin(participants, and(eq(participants.roomId, votes.roomId), eq(participants.id, votes.participantId)))
                .where(and(eq(votes.roomId, room.id), eq(votes.roundId, currentRound.id))),
            )
          : undefined;

        return {
          room,
          participants: participantRows,
          submittedBallotCount,
          ownBallot,
          currentRound: {
            roundId: currentRound.id,
            roundNumber: currentRound.roundNumber,
            status: currentRound.status,
            movies: publicMovies,
            ...(result === undefined ? {} : { result }),
          },
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  private toTerminalResult(
    status: TerminalRoundStatus,
    publicMovies: readonly PublicRoomMovie[],
    movieRows: readonly { movieId: number; isSelected: boolean }[],
    voteRows: readonly { movieId: number; role: ParticipantRole; value: VoteValue }[],
  ): PublicRoundResult {
    const movieVotes = this.toPublicMovieVoteSet(publicMovies, voteRows);
    const selectedMovieId = this.toSelectedMovieId(movieRows);

    switch (status) {
      case ROUND_STATUS.MATCHED:
        if (selectedMovieId === null || !publicMovies.some(movie => movie.movieId === selectedMovieId)) {
          throw new Error("A matched round must have exactly one selected current-round movie.");
        }

        return { status, selectedMovieId, movieVotes };
      case ROUND_STATUS.NO_MATCH:
        if (selectedMovieId !== null) {
          throw new Error("A no-match round cannot have a selected movie.");
        }

        return { status, selectedMovieId: null, movieVotes };
      default:
        return assertNever(status);
    }
  }

  private toPublicMovieVoteSet(
    publicMovies: readonly PublicRoomMovie[],
    voteRows: readonly { movieId: number; role: ParticipantRole; value: VoteValue }[],
  ): PublicRoundMovieVoteSet {
    const votesByMovie = new Map<number, PublicRoundVote[]>();

    for (const movie of publicMovies) {
      votesByMovie.set(movie.movieId, []);
    }

    for (const vote of voteRows) {
      const movieVotes = votesByMovie.get(vote.movieId);

      if (movieVotes === undefined) {
        throw new Error("A terminal vote is not attached to a current round movie.");
      }

      movieVotes.push({ role: vote.role, value: vote.value });
    }

    const movieVotes = publicMovies.map(movie => this.toPublicMovieVotes(movie.movieId, votesByMovie.get(movie.movieId) ?? []));

    if (!this.isPublicRoundMovieVoteSet(movieVotes)) {
      throw new Error("A terminal round must expose two votes for each of its three movies.");
    }

    return movieVotes;
  }

  private toSelectedMovieId(movieRows: readonly { movieId: number; isSelected: boolean }[]): number | null {
    const [selectedMovieId, ...unexpectedSelectedMovieIds] = new Set(movieRows.filter(movie => movie.isSelected).map(movie => movie.movieId));

    if (unexpectedSelectedMovieIds.length !== 0) {
      throw new Error("A terminal round cannot have more than one selected movie.");
    }

    return selectedMovieId ?? null;
  }

  private toPublicMovieVotes(movieId: number, votesForMovie: readonly PublicRoundVote[]): PublicRoundMovieVotes {
    const orderedVotes = [...votesForMovie].sort((left, right) => (left.role === "host" ? -1 : 1) - (right.role === "host" ? -1 : 1));

    if (!isPair(orderedVotes) || orderedVotes[0].role !== "host" || orderedVotes[1].role !== "guest") {
      throw new Error("A terminal movie must have one host vote and one guest vote.");
    }

    return { movieId, votes: orderedVotes };
  }

  private isPublicRoundMovieVoteSet(movieVotes: readonly PublicRoundMovieVotes[]): movieVotes is PublicRoundMovieVoteSet {
    return movieVotes.length === 3 && new Set(movieVotes.map(movie => movie.movieId)).size === 3;
  }
}
