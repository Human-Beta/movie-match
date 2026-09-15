import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { genres, movieGenres, movies, participants, roundBallots, rooms, roundMovies, rounds, votes } from "@/lib/db/schema";
import { isPublicRoomMovies, type ParticipantOwnBallot, type PublicRoomMovie } from "@/lib/participants/public-participant-snapshot";
import type { ParticipantSnapshotRecord, ParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-service";

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
          },
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
