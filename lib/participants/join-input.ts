import { z } from "zod";

import { roomCodeSchema } from "@/lib/rooms/room-code";

export const PARTICIPANT_NAME_MAX_CODE_POINTS = 50;

export const participantNameSchema = z
  .string()
  .transform(value => value.trim())
  .superRefine((value, context) => {
    const codePointLength = Array.from(value).length;

    if (codePointLength < 1 || codePointLength > PARTICIPANT_NAME_MAX_CODE_POINTS) {
      context.addIssue({
        code: "custom",
        message: "Participant name must contain between 1 and 50 code points.",
      });
    }
  });

export const joinRoomInputSchema = z
  .object({
    roomCode: roomCodeSchema,
    name: participantNameSchema,
  })
  .strict();

export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;
