import assert from "node:assert/strict";
import test from "node:test";
import { JOIN_ROOM_REFRESH_MS, startRoomExpirationRefresh } from "@/app/join/[roomCode]/use-room-expiration-refresh";
import type { TimerScheduler } from "@/app/room-participants/timer-scheduler";

class FakeScheduler implements TimerScheduler {
  elapsed = 0;
  private nextId = 0;
  readonly timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, milliseconds: number): number {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.elapsed + milliseconds, callback });
    return id;
  }

  clearTimeout(timerId: number): void {
    this.timers.delete(timerId);
  }

  advance(milliseconds: number): void {
    const target = this.elapsed + milliseconds;
    for (;;) {
      const next = [...this.timers.entries()].sort((left, right) => left[1].at - right[1].at).at(0) ?? null;
      if (next === null || next[1].at > target) {
        break;
      }
      this.elapsed = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.elapsed = target;
  }
}

function start(scheduler: FakeScheduler, refresh: () => void, skew = 0): () => void {
  return startRoomExpirationRefresh({
    expiresAt: new Date(7_000).toISOString(),
    now: (): number => scheduler.elapsed + skew,
    scheduler,
    refresh,
  });
}

test("a ten-minute-slow clock still reconciles server expiration within one polling interval", () => {
  const scheduler = new FakeScheduler();
  const reads: number[] = [];
  let closed = false;
  const stop = start(
    scheduler,
    (): void => {
      reads.push(scheduler.elapsed);
      closed = scheduler.elapsed >= 7_000;
    },
    -600_000,
  );
  scheduler.advance(7_000);
  assert.equal(closed, false);
  scheduler.advance(JOIN_ROOM_REFRESH_MS);
  assert.equal(closed, true);
  assert.deepEqual(reads, [5_000, 10_000]);
  stop();
});

test("the local deadline shortens polling without replacing the server decision", () => {
  const scheduler = new FakeScheduler();
  const reads: number[] = [];
  const stop = start(scheduler, (): void => {
    reads.push(scheduler.elapsed);
  });
  scheduler.advance(12_000);
  assert.deepEqual(reads, [5_000, 7_000, 12_000]);
  stop();
});

test("a fast client clock polls at a bounded rate and keeps retrying unsuccessful refreshes", () => {
  const scheduler = new FakeScheduler();
  let reads = 0;
  const stop = start(
    scheduler,
    (): void => {
      reads += 1;
    },
    600_000,
  );
  scheduler.advance(15_000);
  assert.equal(reads, 3);
  assert.equal(scheduler.timers.size, 1);
  stop();
});

test("cleanup cancels the timer and ignores a callback already queued before unmount", () => {
  const scheduler = new FakeScheduler();
  let reads = 0;
  const stop = start(scheduler, (): void => {
    reads += 1;
  });
  const queued = [...scheduler.timers.values()].at(0);
  assert.ok(queued);
  stop();
  queued.callback();
  scheduler.advance(60_000);
  assert.equal(reads, 0);
  assert.equal(scheduler.timers.size, 0);
});
