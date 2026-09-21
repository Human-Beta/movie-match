import "server-only";

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { movies, noMatchRoundReadiness, participants, roomGenres, rooms, roundMovies, rounds } from "@/lib/db/schema";
import { getEligibleMovieConditions } from "@/lib/game-rounds/eligible-movies";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type {
  LockedNoMatchRoom,
  NoMatchNextRoundRepository,
  NoMatchNextRoundRoom,
  NoMatchReadinessReceipt,
} from "@/lib/no-match-next-round/next-round-service";

export class DrizzleNoMatchNextRoundRepository implements NoMatchNextRoundRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async inLockedRoom<T>(roomCode: string, operation: (room: NoMatchNextRoundRoom | null, locked: LockedNoMatchRoom) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();

    return database.transaction(async transaction => {
      const room =
        (
          await transaction
            .select({ id: rooms.id, status: rooms.status, expiresAt: rooms.expiresAt })
            .from(rooms)
            .where(eq(rooms.code, roomCode))
            .limit(1)
            .for("update")
        ).at(0) ?? null;

      async function findReadiness(participantId: string, condition: SQL): Promise<NoMatchReadinessReceipt | null> {
        if (room === null) {
          return null;
        }
        return (
          (
            await transaction
              .select({
                roundId: noMatchRoundReadiness.roundId,
                requestId: noMatchRoundReadiness.requestId,
                payloadHash: noMatchRoundReadiness.payloadHash,
                outcome: noMatchRoundReadiness.outcome,
              })
              .from(noMatchRoundReadiness)
              .where(and(eq(noMatchRoundReadiness.roomId, room.id), eq(noMatchRoundReadiness.participantId, participantId), condition))
              .limit(1)
          ).at(0) ?? null
        );
      }

      const locked: LockedNoMatchRoom = {
        findParticipant: async accessTokenHash => {
          if (room === null) {
            return null;
          }
          return (
            (
              await transaction
                .select({ id: participants.id, role: participants.role })
                .from(participants)
                .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
                .limit(1)
            ).at(0) ?? null
          );
        },
        findReadinessByRequest: async (participantId, requestId) => findReadiness(participantId, eq(noMatchRoundReadiness.requestId, requestId)),
        findReadiness: async (participantId, roundId) => findReadiness(participantId, eq(noMatchRoundReadiness.roundId, roundId)),
        isCurrentNoMatchRound: async roundId => {
          if (room === null) {
            return false;
          }
          const currentRound =
            (
              await transaction
                .select({ id: rounds.id, status: rounds.status })
                .from(rounds)
                .where(eq(rounds.roomId, room.id))
                .orderBy(desc(rounds.roundNumber))
                .limit(1)
            ).at(0) ?? null;
          return currentRound?.id === roundId && currentRound.status === ROUND_STATUS.NO_MATCH;
        },
        saveReadiness: async receipt => {
          if (room === null) {
            throw new Error("Cannot save no-match readiness without a room lock.");
          }
          await transaction.insert(noMatchRoundReadiness).values({ roomId: room.id, ...receipt });
        },
        setReadinessOutcome: async (participantId, roundId, outcome) => {
          if (room === null) {
            throw new Error("Cannot update no-match readiness without a room lock.");
          }
          await transaction
            .update(noMatchRoundReadiness)
            .set({ outcome })
            .where(
              and(
                eq(noMatchRoundReadiness.roomId, room.id),
                eq(noMatchRoundReadiness.roundId, roundId),
                eq(noMatchRoundReadiness.participantId, participantId),
              ),
            );
        },
        countReadiness: async roundId => {
          if (room === null) {
            return 0;
          }
          return (
            (
              await transaction
                .select({ count: sql<number>`count(*)::int` })
                .from(noMatchRoundReadiness)
                .where(and(eq(noMatchRoundReadiness.roomId, room.id), eq(noMatchRoundReadiness.roundId, roundId)))
            ).at(0)?.count ?? 0
          );
        },
        readFilters: async () => {
          if (room === null) {
            throw new Error("Cannot read filters without a room lock.");
          }
          const filters = (
            await transaction
              .select({ netflixOnly: rooms.netflixOnly, underTwoHours: rooms.underTwoHours, yearFilter: rooms.yearFilter })
              .from(rooms)
              .where(eq(rooms.id, room.id))
              .limit(1)
          ).at(0);
          if (filters === undefined) {
            throw new Error("The locked room is missing.");
          }
          const genreRows = await transaction
            .select({ id: roomGenres.genreId })
            .from(roomGenres)
            .where(eq(roomGenres.roomId, room.id))
            .orderBy(asc(roomGenres.genreId));
          return { ...filters, genreIds: genreRows.map(genre => genre.id) };
        },
        selectEligibleMovieIds: async filters => {
          if (room === null) {
            return [];
          }
          return (
            await transaction
              .select({ id: movies.id })
              .from(movies)
              .where(and(...getEligibleMovieConditions(room.id, filters, true)))
              .orderBy(sql`random()`)
              .limit(3)
          ).map(movie => movie.id);
        },
        getNextRoundNumber: async () => {
          if (room === null) {
            throw new Error("Cannot number a round without a room lock.");
          }
          return (
            ((
              await transaction
                .select({ roundNumber: rounds.roundNumber })
                .from(rounds)
                .where(eq(rounds.roomId, room.id))
                .orderBy(desc(rounds.roundNumber))
                .limit(1)
            ).at(0)?.roundNumber ?? 0) + 1
          );
        },
        createRound: async (roundNumber, movieIds) => {
          if (room === null) {
            throw new Error("Cannot create a round without a room lock.");
          }
          const createdRound =
            (await transaction.insert(rounds).values({ roomId: room.id, roundNumber, status: ROUND_STATUS.VOTING }).returning({ id: rounds.id })).at(
              0,
            ) ?? null;
          if (createdRound === null) {
            throw new Error("The round insert returned no row.");
          }
          await transaction
            .insert(roundMovies)
            .values(movieIds.map((movieId, index) => ({ roomId: room.id, roundId: createdRound.id, movieId, position: index + 1 })));
        },
        setRoomStatus: async status => {
          if (room === null) {
            throw new Error("Cannot change room state without a room lock.");
          }
          await transaction.update(rooms).set({ status }).where(eq(rooms.id, room.id));
        },
      };

      return operation(room, locked);
    });
  }
}
