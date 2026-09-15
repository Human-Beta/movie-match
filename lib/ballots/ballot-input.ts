import { z } from "zod";

import { ballotVoteSchema } from "@/lib/ballots/ballot-vote";
import { roomCodeSchema } from "@/lib/rooms/room-code";

export const ballotInputSchema = z.strictObject({
  roomCode: roomCodeSchema,
  roundId: z.uuid(),
  requestId: z.uuid(),
  votes: z.array(ballotVoteSchema).length(3),
});

export type BallotInput = z.infer<typeof ballotInputSchema>;
