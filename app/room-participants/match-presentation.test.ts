import assert from "node:assert/strict";
import test from "node:test";

import { getMatchFinalMessageKey, getMatchPresentation } from "@/app/room-participants/match-presentation";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

const matchedRound: PublicRoomRound = {
  roundId: "a4df6ef7-d7f9-411e-8968-508adc4d8bd6",
  roundNumber: 3,
  status: ROUND_STATUS.MATCHED,
  movies: [
    { movieId: 10, position: 1, title: "Перший фільм", posterPath: null, releaseYear: 2001, runtimeMinutes: 100, genres: ["Драма"] },
    { movieId: 20, position: 2, title: "Другий фільм", posterPath: null, releaseYear: 2002, runtimeMinutes: 101, genres: ["Комедія"] },
    { movieId: 30, position: 3, title: "Третій фільм", posterPath: null, releaseYear: 2003, runtimeMinutes: 102, genres: ["Трилер"] },
  ],
  result: {
    status: ROUND_STATUS.MATCHED,
    selectedMovieId: 20,
    movieVotes: [
      {
        movieId: 10,
        votes: [
          { role: "host", value: "no" },
          { role: "guest", value: "could_watch" },
        ],
      },
      {
        movieId: 20,
        votes: [
          { role: "host", value: "want_to_watch" },
          { role: "guest", value: "could_watch" },
        ],
      },
      {
        movieId: 30,
        votes: [
          { role: "host", value: "not_now" },
          { role: "guest", value: "want_to_watch" },
        ],
      },
    ],
  },
};

test("maps only the persisted selected movie and its authoritative votes", () => {
  const presentation = getMatchPresentation(matchedRound);

  if (presentation === null) {
    assert.fail("Expected the persisted match to have a presentation.");
  }

  assert.equal(presentation.selectedMovie.movieId, 20);
  assert.equal(presentation.selectedVotes.movieId, 20);
  assert.deepEqual(presentation.selectedVotes.votes, [
    { role: "host", value: "want_to_watch" },
    { role: "guest", value: "could_watch" },
  ]);
});

test("uses a stable final message for each round", () => {
  assert.equal(getMatchFinalMessageKey(matchedRound.roundId), getMatchFinalMessageKey(matchedRound.roundId));
});

test("does not invent a match when the persisted result is absent", () => {
  assert.equal(getMatchPresentation({ ...matchedRound, result: undefined }), null);
  assert.equal(getMatchPresentation({ ...matchedRound, status: ROUND_STATUS.VOTING }), null);
});
