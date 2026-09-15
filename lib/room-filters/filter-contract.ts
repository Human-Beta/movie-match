import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";
import { sha256Hex } from "@/lib/sha256";

export function hashRoomFilterContract(filters: RoomFilterValues): string {
  return sha256Hex(
    JSON.stringify({
      netflixOnly: filters.netflixOnly,
      underTwoHours: filters.underTwoHours,
      yearFilter: filters.yearFilter,
      genreIds: [...filters.genreIds].sort((left, right) => left - right),
    }),
  );
}
