import assert from "node:assert/strict";
import test from "node:test";

import type { VoteValue } from "@/lib/ballots/ballot-vote";
import {
  RoundResolutionInvariantError,
  RoundResolver,
  type LockedRoundResolution,
  type PersistedRoundResolutionState,
  type RoundResolution,
} from "@/lib/matches/round-resolver";

const roundId = "11111111-1111-4111-8111-111111111111";

function state(values: readonly [VoteValue, VoteValue, VoteValue, VoteValue, VoteValue, VoteValue]): PersistedRoundResolutionState {
  const participantIds = ["host", "guest"];
  const movieIds = [10, 20, 30];

  return {
    status: "voting",
    movies: movieIds.map(movieId => ({ movieId, isSelected: false })),
    ballots: participantIds.map(participantId => ({ participantId })),
    votes: [
      { participantId: "host", movieId: 10, value: values[0] },
      { participantId: "guest", movieId: 10, value: values[1] },
      { participantId: "host", movieId: 20, value: values[2] },
      { participantId: "guest", movieId: 20, value: values[3] },
      { participantId: "host", movieId: 30, value: values[4] },
      { participantId: "guest", movieId: 30, value: values[5] },
    ],
  };
}

class StubLockedRound implements LockedRoundResolution {
  persisted: { roundId: string; resolution: RoundResolution } | null = null;

  constructor(private readonly state: PersistedRoundResolutionState) {}

  async readRoundResolution(candidateRoundId: string): Promise<PersistedRoundResolutionState | null> {
    return candidateRoundId === roundId ? this.state : null;
  }

  async persistRoundResolution(candidateRoundId: string, resolution: RoundResolution): Promise<void> {
    this.persisted = { roundId: candidateRoundId, resolution };
  }
}

test("selects the strongest shared positive movie regardless of card position", async () => {
  const locked = new StubLockedRound(state(["could_watch", "could_watch", "want_to_watch", "could_watch", "want_to_watch", "want_to_watch"]));
  const result = await new RoundResolver(() => 30).resolve(roundId, locked);

  assert.deepEqual(result, { status: "matched", selectedMovieId: 30 });
  assert.deepEqual(locked.persisted, { roundId, resolution: { status: "matched", selectedMovieId: 30 } });
});

test("treats every pair with a negative vote as not matched", async () => {
  for (const negative of ["not_now", "no"] as const) {
    const locked = new StubLockedRound(state(["want_to_watch", negative, "could_watch", negative, negative, "want_to_watch"]));

    assert.deepEqual(await new RoundResolver().resolve(roundId, locked), { status: "no_match", selectedMovieId: null });
  }
});

test("applies the match rule to every possible vote pair", async () => {
  const values: readonly VoteValue[] = ["want_to_watch", "could_watch", "not_now", "no"];

  for (const hostValue of values) {
    for (const guestValue of values) {
      const locked = new StubLockedRound(state([hostValue, guestValue, "no", "no", "no", "no"]));
      const result = await new RoundResolver(() => 10).resolve(roundId, locked);
      const isMatch =
        (hostValue === "want_to_watch" || hostValue === "could_watch") && (guestValue === "want_to_watch" || guestValue === "could_watch");

      assert.deepEqual(result, isMatch ? { status: "matched", selectedMovieId: 10 } : { status: "no_match", selectedMovieId: null });
    }
  }
});

test("keeps mixed pairs symmetric and lets the injected chooser break only the strongest tie", async () => {
  const locked = new StubLockedRound(state(["could_watch", "want_to_watch", "want_to_watch", "could_watch", "could_watch", "could_watch"]));
  const result = await new RoundResolver(movieIds => {
    assert.deepEqual(movieIds, [10, 20]);
    return 20;
  }).resolve(roundId, locked);

  assert.deepEqual(result, { status: "matched", selectedMovieId: 20 });
});

test("does not resolve an incomplete round and rejects malformed persisted state", async () => {
  const incomplete = state(["want_to_watch", "could_watch", "want_to_watch", "could_watch", "could_watch", "could_watch"]);
  incomplete.ballots = [{ participantId: "host" }];
  incomplete.votes = incomplete.votes.filter(vote => vote.participantId === "host");
  const locked = new StubLockedRound(incomplete);

  assert.equal(await new RoundResolver().resolve(roundId, locked), null);
  assert.equal(locked.persisted, null);

  incomplete.votes.pop();
  await assert.rejects(new RoundResolver().resolve(roundId, locked), RoundResolutionInvariantError);
});

test("replays a persisted terminal winner without calling the chooser", async () => {
  const terminal = state(["want_to_watch", "could_watch", "want_to_watch", "could_watch", "could_watch", "could_watch"]);
  terminal.status = "matched";
  const selectedMovie = terminal.movies.at(1);

  if (selectedMovie === undefined) {
    throw new Error("The fixture must contain a second movie.");
  }

  selectedMovie.isSelected = true;
  const locked = new StubLockedRound(terminal);

  assert.deepEqual(
    await new RoundResolver(() => {
      throw new Error("must not choose a new winner");
    }).resolve(roundId, locked),
    { status: "matched", selectedMovieId: 20 },
  );
  assert.equal(locked.persisted, null);
});
