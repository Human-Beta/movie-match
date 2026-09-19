import assert from "node:assert/strict";
import test from "node:test";

import { PhoneResultRevealController, PHONE_RESULT_REVEAL_FALLBACK_MS } from "@/app/room-participants/phone-result-reveal-controller";
import { getTerminalRoundPresentation, type TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import type { TimerScheduler } from "@/app/room-participants/timer-scheduler";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

class FakeScheduler implements TimerScheduler {
  readonly timers = new Map<number, { callback: () => void; milliseconds: number }>();
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
    assert.ok(entry);
    this.timers.delete(entry[0]);
    entry[1].callback();
  }
}

function presentation(status: "matched" | "no_match", roundId = "11111111-1111-4111-8111-111111111111"): TerminalRoundPresentation {
  const round: PublicRoomRound = {
    roundId,
    roundNumber: 1,
    status,
    movies: [
      { movieId: 10, position: 1, title: "Перший", posterPath: null, releaseYear: 2010, runtimeMinutes: 90, genres: [] },
      { movieId: 20, position: 2, title: "Другий", posterPath: null, releaseYear: 2011, runtimeMinutes: 100, genres: [] },
      { movieId: 30, position: 3, title: "Третій", posterPath: null, releaseYear: 2012, runtimeMinutes: 110, genres: [] },
    ],
    result:
      status === ROUND_STATUS.MATCHED
        ? {
            status,
            selectedMovieId: 10,
            movieVotes: [
              {
                movieId: 10,
                votes: [
                  { role: "host", value: "want_to_watch" },
                  { role: "guest", value: "want_to_watch" },
                ],
              },
              {
                movieId: 20,
                votes: [
                  { role: "host", value: "no" },
                  { role: "guest", value: "no" },
                ],
              },
              {
                movieId: 30,
                votes: [
                  { role: "host", value: "not_now" },
                  { role: "guest", value: "not_now" },
                ],
              },
            ],
          }
        : {
            status,
            selectedMovieId: null,
            movieVotes: [
              {
                movieId: 10,
                votes: [
                  { role: "host", value: "no" },
                  { role: "guest", value: "no" },
                ],
              },
              {
                movieId: 20,
                votes: [
                  { role: "host", value: "no" },
                  { role: "guest", value: "no" },
                ],
              },
              {
                movieId: 30,
                votes: [
                  { role: "host", value: "no" },
                  { role: "guest", value: "no" },
                ],
              },
            ],
          },
  };
  const terminalPresentation = getTerminalRoundPresentation(round);
  assert.ok(terminalPresentation);

  return terminalPresentation;
}

test("opens an already-terminal direct phone load immediately", () => {
  const scheduler = new FakeScheduler();
  const revealed: string[] = [];
  const controller = new PhoneResultRevealController({
    onReveal: (key): void => {
      revealed.push(key);
    },
    scheduler,
  });

  controller.updatePresentation(presentation(ROUND_STATUS.MATCHED), true);

  assert.deepEqual(revealed, ["11111111-1111-4111-8111-111111111111:matched"]);
  assert.equal(scheduler.timers.size, 0);
});

test("accepts only a matching authoritative terminal hint and otherwise uses the bounded fallback", () => {
  const scheduler = new FakeScheduler();
  const revealed: string[] = [];
  const controller = new PhoneResultRevealController({
    onReveal: (key): void => {
      revealed.push(key);
    },
    scheduler,
  });
  const currentPresentation = presentation(ROUND_STATUS.NO_MATCH);

  controller.updatePresentation(currentPresentation, false);
  controller.receiveHint({ roundId: "22222222-2222-4222-8222-222222222222", status: "no_match" });
  controller.receiveHint({ roundId: "11111111-1111-4111-8111-111111111111", status: "matched" });

  assert.deepEqual(revealed, []);
  assert.equal(scheduler.timers.size, 1);
  scheduler.run(PHONE_RESULT_REVEAL_FALLBACK_MS);
  controller.receiveHint({ roundId: "11111111-1111-4111-8111-111111111111", status: "no_match" });

  assert.deepEqual(revealed, [currentPresentation.key]);
  assert.equal(scheduler.timers.size, 0);
});

test("cleans a pending phone fallback when its authoritative round changes or unmounts", () => {
  const scheduler = new FakeScheduler();
  const controller = new PhoneResultRevealController({ onReveal: (): void => undefined, scheduler });

  controller.updatePresentation(presentation(ROUND_STATUS.MATCHED), false);
  controller.updatePresentation(null, false);
  assert.equal(scheduler.timers.size, 0);

  controller.updatePresentation(presentation(ROUND_STATUS.NO_MATCH, "33333333-3333-4333-8333-333333333333"), false);
  controller.stop();

  assert.equal(scheduler.timers.size, 0);
});
