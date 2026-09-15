import assert from "node:assert/strict";
import test from "node:test";

import {
  PARTICIPANT_SNAPSHOT_COALESCE_MS,
  PARTICIPANT_SNAPSHOT_POLL_MS,
  RoomParticipantSync,
  type ParticipantRealtimeSubscriptionStatus,
  type ParticipantSyncScheduler,
  type RoomParticipantSubscription,
} from "@/app/room-participants/room-participant-sync";
import type { ParticipantSnapshotActionResult, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

const waitingSnapshot: PublicParticipantSnapshot = {
  ballotProgress: null,
  currentRound: null,
  roomState: "waiting",
  participantCount: 1,
  participants: [{ name: "Олена", role: "host" }],
};
const readySnapshot: PublicParticipantSnapshot = {
  ballotProgress: null,
  currentRound: null,
  roomState: "waiting",
  participantCount: 2,
  participants: [
    { name: "Олена", role: "host" },
    { name: "Марко", role: "guest" },
  ],
};
const playingSnapshot: PublicParticipantSnapshot = {
  ...readySnapshot,
  roomState: "playing",
  currentRound: {
    roundId: "55555555-5555-4555-8555-555555555555",
    roundNumber: 1,
    status: "voting",
    movies: [
      { movieId: 1, position: 1, title: "Перший", posterPath: null, releaseYear: 2010, runtimeMinutes: 90, genres: [] },
      { movieId: 2, position: 2, title: "Другий", posterPath: null, releaseYear: 2011, runtimeMinutes: 100, genres: [] },
      { movieId: 3, position: 3, title: "Третій", posterPath: null, releaseYear: 2012, runtimeMinutes: 110, genres: [] },
    ],
  },
  ballotProgress: { submittedCount: 0, totalParticipants: 2, readyForResults: false },
};
const exhaustedSnapshot: PublicParticipantSnapshot = {
  ...readySnapshot,
  roomState: "exhausted",
};

type ScheduledTimer = {
  callback: () => void;
  milliseconds: number;
};

class FakeScheduler implements ParticipantSyncScheduler {
  readonly timers = new Map<number, ScheduledTimer>();
  private nextId = 1;

  setTimeout(callback: () => void, milliseconds: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { callback, milliseconds });

    return id;
  }

  clearTimeout(timerId: number): void {
    this.timers.delete(timerId);
  }

  count(milliseconds: number): number {
    return Array.from(this.timers.values()).filter(timer => timer.milliseconds === milliseconds).length;
  }

  run(milliseconds: number): void {
    const timerEntry = Array.from(this.timers.entries()).find(([, timer]) => timer.milliseconds === milliseconds) ?? null;

    assert.ok(timerEntry, `Expected a ${milliseconds}ms timer.`);
    this.timers.delete(timerEntry[0]);
    timerEntry[1].callback();
  }
}

type SubscriptionTracker = {
  active: number;
  maxActive: number;
};

class FakeSubscription implements RoomParticipantSubscription {
  disposed = false;
  private invalidationCallback: (() => void) | null = null;
  private statusCallback: ((status: ParticipantRealtimeSubscriptionStatus) => void) | null = null;
  private subscribed = false;

  constructor(private readonly tracker: SubscriptionTracker) {}

  onInvalidation(callback: () => void): void {
    this.invalidationCallback = callback;
  }

  subscribe(callback: (status: ParticipantRealtimeSubscriptionStatus) => void): void {
    this.statusCallback = callback;
    this.subscribed = true;
    this.tracker.active += 1;
    this.tracker.maxActive = Math.max(this.tracker.maxActive, this.tracker.active);
  }

  dispose(): void {
    if (this.subscribed && !this.disposed) {
      this.tracker.active -= 1;
    }

    this.disposed = true;
  }

  invalidate(_untrustedPayload?: unknown): void {
    void _untrustedPayload;
    this.invalidationCallback?.();
  }

  reportStatus(status: ParticipantRealtimeSubscriptionStatus): void {
    this.statusCallback?.(status);
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function requireResolver<T>(resolver: ((value: T) => void) | null): (value: T) => void {
  assert.ok(resolver);

  return resolver;
}

test("keeps one active channel, resyncs on mount and reconnect, and cleans up", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  const subscriptions: FakeSubscription[] = [];
  const topics: string[] = [];
  const transportStatuses: string[] = [];
  let reads = 0;
  const createSync = (): RoomParticipantSync =>
    new RoomParticipantSync({
      realtimeTopic: "room:11111111-1111-4111-8111-111111111111",
      initialSnapshot: waitingSnapshot,
      scheduler,
      createSubscription: (topic): RoomParticipantSubscription => {
        topics.push(topic);
        const subscription = new FakeSubscription(tracker);
        subscriptions.push(subscription);
        return subscription;
      },
      readSnapshot: async (): Promise<ParticipantSnapshotActionResult> => {
        reads += 1;
        return { status: "ready", snapshot: waitingSnapshot };
      },
      onSnapshot: (): void => undefined,
      onTransportStatus: (status): void => {
        transportStatuses.push(status);
      },
    });
  const firstMount = createSync();

  firstMount.start();
  firstMount.start();
  const firstSubscription = subscriptions.at(0) ?? null;
  assert.ok(firstSubscription);
  firstSubscription.reportStatus("SUBSCRIBED");
  firstSubscription.reportStatus("SUBSCRIBED");
  firstSubscription.invalidate();

  assert.equal(subscriptions.length, 1);
  assert.equal(tracker.active, 1);
  assert.equal(tracker.maxActive, 1);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_COALESCE_MS), 1);

  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.equal(reads, 1);

  firstSubscription.reportStatus("CHANNEL_ERROR");
  firstSubscription.reportStatus("SUBSCRIBED");
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.equal(reads, 2);
  assert.deepEqual(transportStatuses, ["connected", "disconnected", "connected"]);

  firstMount.stop();
  assert.equal(firstSubscription.disposed, true);
  assert.equal(tracker.active, 0);
  assert.equal(scheduler.timers.size, 0);

  const remount = createSync();
  remount.start();
  assert.equal(subscriptions.length, 2);
  assert.equal(tracker.active, 1);
  assert.equal(tracker.maxActive, 1);
  assert.deepEqual(topics, ["room:11111111-1111-4111-8111-111111111111", "room:11111111-1111-4111-8111-111111111111"]);
  remount.stop();
});

test("coalesces burst and forged invalidations into authoritative reads", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  const subscriptions: FakeSubscription[] = [];
  let reads = 0;
  let resolveFirstRead: ((result: ParticipantSnapshotActionResult) => void) | null = null;
  const snapshots: PublicParticipantSnapshot[] = [];
  const sync = new RoomParticipantSync({
    realtimeTopic: "room:11111111-1111-4111-8111-111111111111",
    initialSnapshot: waitingSnapshot,
    scheduler,
    createSubscription: (): RoomParticipantSubscription => {
      const subscription = new FakeSubscription(tracker);
      subscriptions.push(subscription);
      return subscription;
    },
    readSnapshot: (): Promise<ParticipantSnapshotActionResult> => {
      reads += 1;

      if (reads === 1) {
        return new Promise(resolve => {
          resolveFirstRead = resolve;
        });
      }

      return Promise.resolve({ status: "ready", snapshot: readySnapshot });
    },
    onSnapshot: (nextSnapshot): void => {
      snapshots.push(nextSnapshot);
    },
  });

  sync.start();
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  const subscription = subscriptions.at(0) ?? null;
  assert.ok(subscription);
  subscription.invalidate({ participantCount: 99, participants: [{ name: "Підробка", role: "host" }] });
  subscription.invalidate({ roomState: "matched" });
  subscription.reportStatus("SUBSCRIBED");
  assert.equal(reads, 1);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_COALESCE_MS), 0);

  requireResolver(resolveFirstRead)({ status: "ready", snapshot: waitingSnapshot });
  await flushPromises();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_COALESCE_MS), 1);

  subscription.invalidate({ participant: "stale row" });
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();

  assert.equal(reads, 2);
  assert.deepEqual(snapshots, [waitingSnapshot, readySnapshot]);
  assert.equal(JSON.stringify(snapshots).includes("Підробка"), false);
  sync.stop();
});

test("keeps polling while waiting at 2/2 so a missed game start still converges", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  let reads = 0;
  const rejectedErrors: unknown[] = [];
  const snapshots: PublicParticipantSnapshot[] = [];
  const sync = new RoomParticipantSync({
    realtimeTopic: "room:33333333-3333-4333-8333-333333333333",
    initialSnapshot: waitingSnapshot,
    scheduler,
    createSubscription: (): RoomParticipantSubscription => new FakeSubscription(tracker),
    readSnapshot: async (): Promise<ParticipantSnapshotActionResult> => {
      reads += 1;

      if (reads === 1) {
        throw new Error("simulated Server Action outage");
      }

      return { status: "ready", snapshot: reads === 2 ? readySnapshot : playingSnapshot };
    },
    onSnapshot: (nextSnapshot): void => {
      snapshots.push(nextSnapshot);
    },
    onSnapshotReadRejected: (error): boolean => {
      rejectedErrors.push(error);
      return false;
    },
  });

  sync.start();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);

  scheduler.run(PARTICIPANT_SNAPSHOT_POLL_MS);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();

  assert.equal(reads, 2);
  assert.equal(rejectedErrors.length, 1);
  assert.deepEqual(snapshots, [readySnapshot]);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);

  scheduler.run(PARTICIPANT_SNAPSHOT_POLL_MS);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.equal(reads, 3);
  assert.deepEqual(snapshots, [readySnapshot, playingSnapshot]);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  sync.stop();
});

test("keeps polling after the first active-voting snapshot read fails", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  const snapshots: PublicParticipantSnapshot[] = [];
  let reads = 0;
  const sync = new RoomParticipantSync({
    realtimeTopic: "room:55555555-5555-4555-8555-555555555555",
    initialSnapshot: playingSnapshot,
    scheduler,
    createSubscription: (): RoomParticipantSubscription => new FakeSubscription(tracker),
    readSnapshot: async (): Promise<ParticipantSnapshotActionResult> => {
      reads += 1;

      if (reads === 1) {
        throw new Error("simulated Server Action outage");
      }

      return {
        status: "ready",
        snapshot: {
          ...playingSnapshot,
          ballotProgress: { submittedCount: 1, totalParticipants: 2, readyForResults: false },
        },
      };
    },
    onSnapshot: (nextSnapshot): void => {
      snapshots.push(nextSnapshot);
    },
    onSnapshotReadRejected: (): boolean => false,
  });

  sync.start();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);

  scheduler.run(PARTICIPANT_SNAPSHOT_POLL_MS);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();

  assert.equal(reads, 2);
  assert.deepEqual(snapshots, [
    {
      ...playingSnapshot,
      ballotProgress: { submittedCount: 1, totalParticipants: 2, readyForResults: false },
    },
  ]);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  sync.stop();
});

test("keeps polling while exhausted so a missed restart still converges", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  const snapshots: PublicParticipantSnapshot[] = [];
  let reads = 0;
  const sync = new RoomParticipantSync({
    realtimeTopic: "room:33333333-3333-4333-8333-333333333333",
    initialSnapshot: exhaustedSnapshot,
    scheduler,
    createSubscription: (): RoomParticipantSubscription => new FakeSubscription(tracker),
    readSnapshot: async (): Promise<ParticipantSnapshotActionResult> => {
      reads += 1;

      return { status: "ready", snapshot: reads === 1 ? exhaustedSnapshot : playingSnapshot };
    },
    onSnapshot: (nextSnapshot): void => {
      snapshots.push(nextSnapshot);
    },
  });

  sync.start();
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();
  assert.deepEqual(snapshots, [exhaustedSnapshot]);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);

  scheduler.run(PARTICIPANT_SNAPSHOT_POLL_MS);
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  await flushPromises();

  assert.equal(reads, 2);
  assert.deepEqual(snapshots, [exhaustedSnapshot, playingSnapshot]);
  assert.equal(scheduler.count(PARTICIPANT_SNAPSHOT_POLL_MS), 1);
  sync.stop();
});

test("ignores a completed read after unmount", async () => {
  const scheduler = new FakeScheduler();
  const tracker: SubscriptionTracker = { active: 0, maxActive: 0 };
  let resolveRead: ((result: ParticipantSnapshotActionResult) => void) | null = null;
  let updates = 0;
  const sync = new RoomParticipantSync({
    realtimeTopic: "room:44444444-4444-4444-8444-444444444444",
    initialSnapshot: waitingSnapshot,
    scheduler,
    createSubscription: (): RoomParticipantSubscription => new FakeSubscription(tracker),
    readSnapshot: (): Promise<ParticipantSnapshotActionResult> =>
      new Promise(resolve => {
        resolveRead = resolve;
      }),
    onSnapshot: (): void => {
      updates += 1;
    },
  });

  sync.start();
  scheduler.run(PARTICIPANT_SNAPSHOT_COALESCE_MS);
  sync.stop();
  requireResolver(resolveRead)({ status: "ready", snapshot: readySnapshot });
  await flushPromises();

  assert.equal(updates, 0);
  assert.equal(tracker.active, 0);
  assert.equal(scheduler.timers.size, 0);
});
