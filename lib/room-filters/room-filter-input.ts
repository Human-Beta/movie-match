import { z } from "zod";

import { pendingFilterSaveSchema } from "@/lib/room-filters/room-filter-values";
import { roomCodeSchema } from "@/lib/rooms/room-code";

export const saveRoomFiltersInputSchema = pendingFilterSaveSchema.extend({ roomCode: roomCodeSchema });
export type SaveRoomFiltersInput = z.infer<typeof saveRoomFiltersInputSchema>;
