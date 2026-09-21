import { z } from "zod";

import { roomCodeSchema } from "@/lib/rooms/room-code";

export const nextRoundInputSchema = z.strictObject({
  roomCode: roomCodeSchema,
  roundId: z.uuid(),
  requestId: z.uuid(),
});

export type NextRoundInput = z.infer<typeof nextRoundInputSchema>;
