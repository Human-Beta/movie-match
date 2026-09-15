import { createHash } from "node:crypto";

import type { RoomFilterValues } from "@/lib/room-filters/room-filter-values";

export function hashRoomFilterContract(filters: RoomFilterValues): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        netflixOnly: filters.netflixOnly,
        underTwoHours: filters.underTwoHours,
        yearFilter: filters.yearFilter,
        genreIds: [...filters.genreIds].sort((left, right) => left - right),
      }),
    )
    .digest("hex");
}
