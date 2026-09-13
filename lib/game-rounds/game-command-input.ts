import { z } from "zod";

import { roomCodeSchema } from "@/lib/rooms/room-code";

export const gameCommandInputSchema = z.strictObject({
  roomCode: roomCodeSchema,
  requestId: z.uuid(),
});

export type GameCommandInput = z.infer<typeof gameCommandInputSchema>;
