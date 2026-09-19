import assert from "node:assert/strict";
import test from "node:test";

import {
  MATCH_SELECTED_EMPHASIS_MS,
  NO_MATCH_REACTION_MS,
  RoundResultTransitionController,
  type RoundResultTransitionStage,
} from "@/app/room-participants/round-result-transition-controller";
import { getTerminalRoundPresentation, type TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import type { TimerScheduler } from "@/app/room-participants/timer-scheduler";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomRound, PublicRoundMovieVoteSet } from "@/lib/participants/public-participant-snapshot";

type ScheduledTimer = {
  callback: () => void;
  milliseconds: number;
};

class FakeScheduler implements TimerScheduler {
  readonly timers = new Map<number, ScheduledTimer>();
  private nextId = 1;

  setTimeout(callback: () => void, milliseconds: number): number {
    const timerId = this.nextId;
    this.nextId += 1;
    this.timers.set(timerId, { callback, milliseconds });

    return timerId;
  }

  clearTimeout(timerId: number): void {
    this.timers.delete(timerId);
  }

  run(milliseconds: number): void {
    const entry = Array.from(this.timers.entries()).find(([, timer]) => timer.milliseconds === milliseconds) ?? null;

    assert.ok(entry, `Expected a ${milliseconds}ms timer.`);
    this.timers.delete(entry[0]);
    entry[1].callback();
  }
}

function makeRound(status: "matched" | "no_match"): PublicRoomRound {
  const movies: PublicRoomRound["movies"] = [
    { movieId: 10, position: 1, title: "Перший", posterPath: null, releaseYear: 2010, runtimeMinutes: 90, genres: [] },
    { movieId: 20, position: 2, title: "Другий", posterPath: null, releaseYear: 2011, runtimeMinutes: 100, genres: [] },
    { movieId: 30, position: 3, title: "Третій", posterPath: null, releaseYear: 2012, runtimeMinutes: 110, genres: [] },
  ];
  const movieVotes: PublicRoundMovieVoteSet = [
    {
      movieId: 10,
      votes: [
        { role: "host", value: "want_to_watch" },
        { role: "guest", value: "could_watch" },
      ],
    },
    {
      movieId: 20,
      votes: [
        { role: "host", value: "not_now" },
        { role: "guest", value: "no" },
      ],
    },
    {
      movieId: 30,
      votes: [
        { role: "host", value: "no" },
        { role: "guest", value: "not_now" },
      ],
    },
  ];

  return {
    roundId: "11111111-1111-4111-8111-111111111111",
    roundNumber: 1,
    status,
    movies,
    result: status === ROUND_STATUS.MATCHED ? { status, selectedMovieId: 20, movieVotes } : { status, selectedMovieId: null, movieVotes },
  };
}

function requirePresentation(round: PublicRoomRound): TerminalRoundPresentation {
  const presentation = getTerminalRoundPresentation(round);
  assert.ok(presentation);

  return presentation;
}

test("maps only a persisted matched result to its selected round movie and stable round-status key", () => {
  const presentation = requirePresentation(makeRound(ROUND_STATUS.MATCHED));

  assert.equal(presentation.key, "11111111-1111-4111-8111-111111111111:matched");
  assert.equal(presentation.selectedMovie?.movieId, 20);
  assert.equal(getTerminalRoundPresentation({ ...makeRound(ROUND_STATUS.MATCHED), result: undefined }), null);
  const matchedRound = makeRound(ROUND_STATUS.MATCHED);
  const matchedResult = matchedRound.result;

  if (matchedResult === undefined || matchedResult.status !== ROUND_STATUS.MATCHED) {
    throw new Error("The matched fixture must include a matched result.");
  }

  assert.equal(
    getTerminalRoundPresentation({
      ...matchedRound,
      result: { ...matchedResult, selectedMovieId: 999 },
    }),
    null,
  );
});

test("runs one match emphasis before one completion", () => {
  const scheduler = new FakeScheduler();
  const stages: RoundResultTransitionStage[] = [];
  const completed: string[] = [];
  const controller = new RoundResultTransitionController({
    onComplete: (presentation): void => {
      completed.push(presentation.key);
    },
    onStageChange: (stage): void => {
      stages.push(stage);
    },
    presentation: requirePresentation(makeRound(ROUND_STATUS.MATCHED)),
    reducedMotion: false,
    scheduler,
  });

  controller.start();
  scheduler.run(MATCH_SELECTED_EMPHASIS_MS);

  assert.deepEqual(stages, ["match_emphasis", "stable"]);
  assert.deepEqual(completed, ["11111111-1111-4111-8111-111111111111:matched"]);
  assert.equal(scheduler.timers.size, 0);
});

test("completes a no-match reaction once and clears an abandoned transition", () => {
  const scheduler = new FakeScheduler();
  const completed: string[] = [];
  const controller = new RoundResultTransitionController({
    onComplete: (presentation): void => {
      completed.push(presentation.key);
    },
    onStageChange: (): void => undefined,
    presentation: requirePresentation(makeRound(ROUND_STATUS.NO_MATCH)),
    reducedMotion: false,
    scheduler,
  });

  controller.start();
  scheduler.run(NO_MATCH_REACTION_MS);
  controller.stop();

  assert.deepEqual(completed, ["11111111-1111-4111-8111-111111111111:no_match"]);
  assert.equal(scheduler.timers.size, 0);

  const interrupted = new RoundResultTransitionController({
    onComplete: (presentation): void => {
      completed.push(presentation.key);
    },
    onStageChange: (): void => undefined,
    presentation: requirePresentation(makeRound(ROUND_STATUS.NO_MATCH)),
    reducedMotion: false,
    scheduler,
  });
  interrupted.start();
  interrupted.stop();

  assert.deepEqual(completed, ["11111111-1111-4111-8111-111111111111:no_match"]);
  assert.equal(scheduler.timers.size, 0);
});

test("uses the same readable stable result without timers for reduced motion", () => {
  const scheduler = new FakeScheduler();
  const stages: RoundResultTransitionStage[] = [];
  let completions = 0;
  const controller = new RoundResultTransitionController({
    onComplete: (): void => {
      completions += 1;
    },
    onStageChange: (stage): void => {
      stages.push(stage);
    },
    presentation: requirePresentation(makeRound(ROUND_STATUS.MATCHED)),
    reducedMotion: true,
    scheduler,
  });

  controller.start();

  assert.deepEqual(stages, ["stable"]);
  assert.equal(completions, 1);
  assert.equal(scheduler.timers.size, 0);
});
