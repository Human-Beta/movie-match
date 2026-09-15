import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { ballotInputSchema } from "@/lib/ballots/ballot-input";
import { voteValueSchema } from "@/lib/ballots/ballot-vote";

const roundId = "11111111-1111-4111-8111-111111111111";

test("accepts every supported vote value in a complete three-vote ballot", () => {
  for (const value of voteValueSchema.options) {
    const result = ballotInputSchema.safeParse({
      roomCode: "ABCD",
      roundId,
      requestId: randomUUID(),
      votes: [
        { movieId: 1, value },
        { movieId: 2, value },
        { movieId: 3, value },
      ],
    });

    assert.equal(result.success, true);
  }
});

test("rejects malformed room, round, request, vote values, and ballot lengths", () => {
  const valid = {
    roomCode: "ABCD",
    roundId,
    requestId: randomUUID(),
    votes: [
      { movieId: 1, value: "want_to_watch" },
      { movieId: 2, value: "could_watch" },
      { movieId: 3, value: "not_now" },
    ],
  };

  assert.equal(ballotInputSchema.safeParse({ ...valid, roomCode: "not a room" }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, roundId: "round" }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, requestId: "request" }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, votes: valid.votes.slice(0, 2) }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, votes: [...valid.votes, valid.votes[0]] }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, votes: [{ movieId: 1, value: "maybe" }, ...valid.votes.slice(1)] }).success, false);
  assert.equal(ballotInputSchema.safeParse({ ...valid, additional: true }).success, false);
});
