import { z } from "zod";

export const voteValueSchema = z.enum(["want_to_watch", "could_watch", "not_now", "no"]);

export const ballotVoteSchema = z.strictObject({
  movieId: z.int().positive(),
  value: voteValueSchema,
});

export type VoteValue = z.infer<typeof voteValueSchema>;
export type BallotVoteInput = z.infer<typeof ballotVoteSchema>;
