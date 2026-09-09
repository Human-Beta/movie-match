import { z } from "zod";

export const yearFilterSchema = z.enum(["any", "new", "old"]);

// Different filter categories use AND; genre IDs use OR. Empty genres means any.
// Netflix uses the curated catalog flag, runtime is < 120, and new means > 2010.
export const roomFilterValuesSchema = z.strictObject({
  netflixOnly: z.boolean(),
  underTwoHours: z.boolean(),
  yearFilter: yearFilterSchema,
  genreIds: z.array(z.number().int().positive().max(2147483647)).transform(ids => [...new Set(ids)].sort((a, b) => a - b)),
});

export type RoomFilterValues = z.infer<typeof roomFilterValuesSchema>;
export type FilterGenre = { id: number; name: string };
export type RoomFilterSnapshot = { filters: RoomFilterValues; genres: FilterGenre[] };

export const pendingFilterSaveSchema = z.strictObject({
  requestId: z.uuid(),
  filters: roomFilterValuesSchema,
});

export type PendingFilterSave = z.infer<typeof pendingFilterSaveSchema>;

export type ReadRoomFiltersResult = { status: "ready"; snapshot: RoomFilterSnapshot } | { status: "unavailable" } | { status: "error" };
export type SaveRoomFiltersResult =
  | { status: "saved"; filters: RoomFilterValues }
  | { status: "unavailable" }
  | { status: "validation_error" }
  | { status: "conflict" }
  | { status: "error" };
