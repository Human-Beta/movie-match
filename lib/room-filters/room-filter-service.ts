import { SystemClock, type Clock } from "@/lib/clock";
import type { ParticipantRole } from "@/lib/participants/participant-service";
import { hashStoredParticipantAccessToken } from "@/lib/participants/participant-token";
import type { SaveRoomFiltersInput } from "@/lib/room-filters/room-filter-input";
import { hashRoomFilterContract } from "@/lib/room-filters/filter-contract";
import type { FilterGenre, ReadRoomFiltersResult, RoomFilterValues, SaveRoomFiltersResult } from "@/lib/room-filters/room-filter-values";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type FilterRoom = { status: RoomStatus; expiresAt: Date };
export type LockedFilterRoom = {
  findParticipantRole(accessTokenHash: string): Promise<ParticipantRole | null>;
  readFilters(): Promise<RoomFilterValues>;
  listGenres(): Promise<FilterGenre[]>;
  hasCatalogInsufficientStart(filterHash: string): Promise<boolean>;
  findSavePayloadHash(requestId: string): Promise<string | null>;
  saveFilters(input: SaveRoomFiltersInput, payloadHash: string, filtersChanged: boolean): Promise<void>;
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
      if (!this.isFilterEditable(room) || (await locked.findParticipantRole(tokenHash)) !== "host") {
        return { status: "unavailable" };
      }
      const filters = await locked.readFilters();
      const genres = await locked.listGenres();
      const publicFilters = this.publicFilters(filters);
      return {
        status: "ready",
        snapshot: {
          filters: publicFilters,
          genres: genres.map(({ id, name }) => ({ id, name })),
          startEligible: !(await locked.hasCatalogInsufficientStart(hashRoomFilterContract(publicFilters))),
        },
      };
    });
  }

  async save(input: SaveRoomFiltersInput, storedAccessToken: string | null): Promise<SaveRoomFiltersResult> {
    const tokenHash = hashStoredParticipantAccessToken(storedAccessToken);
    if (tokenHash === null) {
      return { status: "unavailable" };
    }
    const publicInputFilters = this.publicFilters(input.filters);
    const payloadHash = hashRoomFilterContract(publicInputFilters);

    return this.repository.inLockedRoom(input.roomCode, async (room, locked): Promise<SaveRoomFiltersResult> => {
      if (!this.isFilterEditable(room) || (await locked.findParticipantRole(tokenHash)) !== "host") {
        return { status: "unavailable" };
      }
      const savedPayloadHash = await locked.findSavePayloadHash(input.requestId);
      if (savedPayloadHash !== null) {
        const filters = this.publicFilters(await locked.readFilters());
        return savedPayloadHash === payloadHash
          ? {
              status: "saved",
              filters,
              startEligible: !(await locked.hasCatalogInsufficientStart(hashRoomFilterContract(filters))),
            }
          : { status: "conflict" };
      }

      const genres = await locked.listGenres();
      const genreIds = new Set(genres.map(genre => genre.id));
      if (input.filters.genreIds.some(id => !genreIds.has(id))) {
        return { status: "validation_error" };
      }
      if (!this.isFilterEditable(room)) {
        return { status: "unavailable" };
      }
      const savedFilters = this.publicFilters(await locked.readFilters());
      const filtersChanged = !this.areFiltersEqual(savedFilters, publicInputFilters);
      await locked.saveFilters(input, payloadHash, filtersChanged);
      return {
        status: "saved",
        filters: publicInputFilters,
        startEligible: filtersChanged || !(await locked.hasCatalogInsufficientStart(payloadHash)),
      };
    });
  }

  private isFilterEditable(room: FilterRoom | null): boolean {
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

  private areFiltersEqual(left: RoomFilterValues, right: RoomFilterValues): boolean {
    return (
      left.netflixOnly === right.netflixOnly &&
      left.underTwoHours === right.underTwoHours &&
      left.yearFilter === right.yearFilter &&
      left.genreIds.length === right.genreIds.length &&
      left.genreIds.every((genreId, index) => genreId === right.genreIds[index])
    );
  }
}
