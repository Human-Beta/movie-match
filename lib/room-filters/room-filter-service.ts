import { createHash } from "node:crypto";

import { SystemClock, type Clock } from "@/lib/clock";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { SaveRoomFiltersInput } from "@/lib/room-filters/room-filter-input";
import type { FilterGenre, ReadRoomFiltersResult, RoomFilterValues, SaveRoomFiltersResult } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type FilterRoom = { status: RoomStatus; expiresAt: Date };
export type LockedFilterRoom = {
  findParticipantRole(accessTokenHash: string): Promise<ParticipantRole | null>;
  readFilters(): Promise<RoomFilterValues>;
  listGenres(): Promise<FilterGenre[]>;
  findSavePayloadHash(requestId: string): Promise<string | null>;
  saveFilters(input: SaveRoomFiltersInput, payloadHash: string): Promise<void>;
};
export type RoomFilterRepository = {
  inLockedRoom<T>(roomCode: string, operation: (room: FilterRoom | null, locked: LockedFilterRoom) => Promise<T>): Promise<T>;
};

export class RoomFilterService {
  constructor(
    private readonly repository: RoomFilterRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async read(roomCode: string, storedAccessToken: string | null): Promise<ReadRoomFiltersResult> {
    const tokenHash = hashStoredParticipantAccessToken(storedAccessToken);
    if (tokenHash === null) {
      return { status: "unavailable" };
    }

    return this.repository.inLockedRoom(roomCode, async (room, locked): Promise<ReadRoomFiltersResult> => {
      if (!this.isWaiting(room) || (await locked.findParticipantRole(tokenHash)) !== "host") {
        return { status: "unavailable" };
      }
      const filters = await locked.readFilters();
      const genres = await locked.listGenres();
      return { status: "ready", snapshot: { filters: this.publicFilters(filters), genres: genres.map(({ id, name }) => ({ id, name })) } };
    });
  }

  async save(input: SaveRoomFiltersInput, storedAccessToken: string | null): Promise<SaveRoomFiltersResult> {
    const tokenHash = hashStoredParticipantAccessToken(storedAccessToken);
    if (tokenHash === null) {
      return { status: "unavailable" };
    }
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(this.publicFilters(input.filters)))
      .digest("hex");

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<SaveRoomFiltersResult> => {
      if (!this.isWaiting(room) || (await locked.findParticipantRole(tokenHash)) !== "host") {
        return { status: "unavailable" };
      }
      const savedPayloadHash = await locked.findSavePayloadHash(input.requestId);
      if (savedPayloadHash !== null) {
        return savedPayloadHash === payloadHash
          ? { status: "saved", filters: this.publicFilters(await locked.readFilters()) }
          : { status: "conflict" };
      }

      const genres = await locked.listGenres();
      const genreIds = new Set(genres.map(genre => genre.id));
      if (input.filters.genreIds.some(id => !genreIds.has(id))) {
        return { status: "validation_error" };
      }
      if (!this.isWaiting(room)) {
        return { status: "unavailable" };
      }
      await locked.saveFilters(input, payloadHash);
      return { status: "saved", filters: this.publicFilters(input.filters) };
    });
  }

  private isWaiting(room: FilterRoom | null): boolean {
    return room !== null && room.status === "waiting" && room.expiresAt.getTime() > this.clock.now().getTime();
  }

  private publicFilters(filters: RoomFilterValues): RoomFilterValues {
    return {
      netflixOnly: filters.netflixOnly,
      underTwoHours: filters.underTwoHours,
      yearFilter: filters.yearFilter,
      genreIds: [...filters.genreIds],
    };
  }
}
