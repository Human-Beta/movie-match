import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { loadDatabase, type DatabaseProvider } from "@/lib/db/database-provider";
import { genres, participants, roomFilterSaves, roomGenres, rooms } from "@/lib/db/schema";
import type { FilterRoom, LockedFilterRoom, RoomFilterRepository } from "@/lib/room-filters/room-filter-service";

export class DrizzleRoomFilterRepository implements RoomFilterRepository {
  constructor(private readonly getDatabase: DatabaseProvider = loadDatabase) {}

  async inLockedRoom<T>(roomCode: string, operation: (room: FilterRoom | null, locked: LockedFilterRoom) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();
    return database.transaction(async transaction => {
      const [room] = await transaction
        .select({ id: rooms.id, status: rooms.status, expiresAt: rooms.expiresAt })
        .from(rooms)
        .where(eq(rooms.code, roomCode))
        .limit(1)
        .for("update");
      const locked: LockedFilterRoom = {
        findParticipantRole: async accessTokenHash => {
          if (!room) {
            return null;
          }
          const [participant] = await transaction
            .select({ role: participants.role })
            .from(participants)
            .where(and(eq(participants.roomId, room.id), eq(participants.accessTokenHash, accessTokenHash)))
            .limit(1);
          return participant?.role ?? null;
        },
        readFilters: async () => {
          if (!room) {
            throw new Error("Filter reads require a room lock.");
          }
          const [filters] = await transaction
            .select({ netflixOnly: rooms.netflixOnly, underTwoHours: rooms.underTwoHours, yearFilter: rooms.yearFilter })
            .from(rooms)
            .where(eq(rooms.id, room.id));
          if (!filters) {
            throw new Error("The locked room is missing.");
          }
          const selectedGenres = await transaction
            .select({ id: roomGenres.genreId })
            .from(roomGenres)
            .where(eq(roomGenres.roomId, room.id))
            .orderBy(asc(roomGenres.genreId));
          return { ...filters, genreIds: selectedGenres.map(genre => genre.id) };
        },
        listGenres: () => transaction.select({ id: genres.id, name: genres.name }).from(genres).orderBy(asc(genres.name)),
        findSavePayloadHash: async requestId => {
          if (!room) {
            return null;
          }
          const [save] = await transaction
            .select({ payloadHash: roomFilterSaves.payloadHash })
            .from(roomFilterSaves)
            .where(and(eq(roomFilterSaves.roomId, room.id), eq(roomFilterSaves.requestId, requestId)))
            .limit(1);
          return save?.payloadHash ?? null;
        },
        saveFilters: async (input, payloadHash) => {
          if (!room) {
            throw new Error("Filter writes require a room lock.");
          }
          const { netflixOnly, underTwoHours, yearFilter, genreIds } = input.filters;
          await transaction.update(rooms).set({ netflixOnly, underTwoHours, yearFilter }).where(eq(rooms.id, room.id));
          await transaction.delete(roomGenres).where(eq(roomGenres.roomId, room.id));
          if (genreIds.length) {
            await transaction.insert(roomGenres).values(genreIds.map(genreId => ({ roomId: room.id, genreId })));
          }
          await transaction.insert(roomFilterSaves).values({ roomId: room.id, requestId: input.requestId, payloadHash });
        },
      };
      return operation(room ?? null, locked);
    });
  }
}
