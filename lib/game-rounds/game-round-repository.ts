import "server-only";

import { and, asc, eq, inArray, max, sql, type SQL } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { movieGenres, movies, participants, roomGameCommands, roomGenres, rooms, roundMovies, rounds } from "@/lib/db/schema";
import type { GameRoom, GameRoundRepository, LockedGameRoom } from "@/lib/game-rounds/game-round-service";
import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

export class DrizzleGameRoundRepository implements GameRoundRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async inLockedRoom<T>(roomCode: string, operation: (room: GameRoom | null, locked: LockedGameRoom) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();

    return database.transaction(async transaction => {
      const roomRows = await transaction
        .select({ id: rooms.id, status: rooms.status, expiresAt: rooms.expiresAt })
        .from(rooms)
        .where(eq(rooms.code, roomCode))
        .limit(1)
        .for("update");
      const room = roomRows.at(0) ?? null;

      const locked: LockedGameRoom = {
        findParticipantRole: async accessTokenHash => {
          if (room === null) {
            return null;
          }

          const rows = await transaction
            .select({ role: participants.role })
            .from(participants)
            .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
            .limit(1);

          return rows.at(0)?.role ?? null;
        },
        countParticipants: async () => {
          if (room === null) {
            return 0;
          }

          const rows = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(participants)
            .where(eq(participants.roomId, room.id));

          return rows.at(0)?.count ?? 0;
        },
        readFilters: async () => {
          const currentRoom = this.requireRoom(room);
          const filterRows = await transaction
            .select({ netflixOnly: rooms.netflixOnly, underTwoHours: rooms.underTwoHours, yearFilter: rooms.yearFilter })
            .from(rooms)
            .where(eq(rooms.id, currentRoom.id))
            .limit(1);
          const filters = filterRows.at(0);

          if (!filters) {
            throw new Error("The locked room is missing.");
          }

          const selectedGenres = await transaction
            .select({ id: roomGenres.genreId })
            .from(roomGenres)
            .where(eq(roomGenres.roomId, currentRoom.id))
            .orderBy(asc(roomGenres.genreId));

          return { ...filters, genreIds: selectedGenres.map(genre => genre.id) };
        },
        findCommand: async requestId => {
          if (room === null) {
            return null;
          }

          const rows = await transaction
            .select({
              command: roomGameCommands.command,
              payloadHash: roomGameCommands.payloadHash,
              filterHash: roomGameCommands.filterHash,
              outcome: roomGameCommands.outcome,
            })
            .from(roomGameCommands)
            .where(and(eq(roomGameCommands.roomId, room.id), eq(roomGameCommands.requestId, requestId)))
            .limit(1);
          const receipt = rows.at(0);

          if (!receipt) {
            return null;
          }

          return {
            command: receipt.command,
            payloadHash: receipt.payloadHash,
            filterHash: receipt.filterHash,
            outcome: receipt.outcome,
          };
        },
        selectEligibleMovieIds: async (filters, excludeSeen) => {
          const currentRoom = this.requireRoom(room);
          const conditions = this.getMovieConditions(currentRoom.id, filters, excludeSeen);
          const rows = await transaction
            .select({ id: movies.id })
            .from(movies)
            .where(and(...conditions))
            .orderBy(sql`random()`)
            .limit(3);

          return rows.map(movie => movie.id);
        },
        getNextRoundNumber: async () => {
          const currentRoom = this.requireRoom(room);
          const rows = await transaction
            .select({ value: max(rounds.roundNumber) })
            .from(rounds)
            .where(eq(rounds.roomId, currentRoom.id));

          return (rows.at(0)?.value ?? 0) + 1;
        },
        deleteRoundHistory: async () => {
          const currentRoom = this.requireRoom(room);
          await transaction.delete(rounds).where(eq(rounds.roomId, currentRoom.id));
        },
        createRound: async (roundNumber, movieIds) => {
          const currentRoom = this.requireRoom(room);
          const createdRounds = await transaction
            .insert(rounds)
            .values({ roomId: currentRoom.id, roundNumber, status: "voting" })
            .returning({ id: rounds.id });
          const createdRound = createdRounds.at(0);

          if (!createdRound) {
            throw new Error("The round insert returned no row.");
          }

          await transaction.insert(roundMovies).values(
            movieIds.map((movieId, index) => ({
              roomId: currentRoom.id,
              roundId: createdRound.id,
              movieId,
              position: index + 1,
            })),
          );
        },
        setRoomStatus: async status => {
          const currentRoom = this.requireRoom(room);
          await transaction.update(rooms).set({ status }).where(eq(rooms.id, currentRoom.id));
        },
        saveCommand: async (requestId, receipt) => {
          const currentRoom = this.requireRoom(room);
          await transaction.insert(roomGameCommands).values({ roomId: currentRoom.id, requestId, ...receipt });
        },
      };

      return operation(room, locked);
    });
  }

  private getMovieConditions(roomId: string, filters: RoomFilterValues, excludeSeen: boolean): SQL[] {
    const conditions: SQL[] = [];

    if (filters.netflixOnly) {
      conditions.push(eq(movies.availableOnNetflix, true));
    }

    if (filters.underTwoHours) {
      conditions.push(sql`${movies.runtimeMinutes} < 120`);
    }

    if (filters.yearFilter === "new") {
      conditions.push(sql`${movies.releaseYear} > 2010`);
    } else if (filters.yearFilter === "old") {
      conditions.push(sql`${movies.releaseYear} <= 2010`);
    }

    if (filters.genreIds.length > 0) {
      conditions.push(sql`exists (
        select 1 from ${movieGenres}
        where ${movieGenres.movieId} = ${movies.id}
          and ${inArray(movieGenres.genreId, filters.genreIds)}
      )`);
    }

    if (excludeSeen) {
      conditions.push(sql`not exists (
        select 1 from ${roundMovies}
        where ${roundMovies.roomId} = ${roomId}
          and ${roundMovies.movieId} = ${movies.id}
      )`);
    }

    return conditions;
  }

  private requireRoom(room: GameRoom | null): GameRoom {
    if (room === null) {
      throw new Error("The game command requires a room lock.");
    }

    return room;
  }
}
