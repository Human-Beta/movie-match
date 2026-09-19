import assert from "node:assert/strict";
import test from "node:test";

import { RoomParticipantSubscriptionManager, type SubscriptionCleanupScheduler } from "@/app/room-participants/room-participant-subscription-manager";
import type { ParticipantRealtimeSubscriptionStatus } from "@/app/room-participants/room-participant-sync";
import type { ResultRevealReadyHint } from "@/lib/realtime/result-reveal-hint";

type FakeChannel = {
  on(type: "broadcast", filter: { event: string }, callback: (payload: unknown) => void): FakeChannel;
  send(message: { event: string; payload: ResultRevealReadyHint; type: "broadcast" }): Promise<unknown>;
  subscribe(callback: (status: ParticipantRealtimeSubscriptionStatus) => void): void;
  emitInvalidation(event?: "participants_changed" | "room_changed"): void;
  emitResultReveal(payload: unknown): void;
  emitStatus(status: ParticipantRealtimeSubscriptionStatus): void;
};

class FakeCleanupScheduler implements SubscriptionCleanupScheduler {
  private callback: (() => void) | null = null;

  setTimeout(callback: () => void, _milliseconds: number): number {
    void _milliseconds;
    this.callback = callback;
    return 1;
  }

  clearTimeout(_timerId: number): void {
    void _timerId;
    this.callback = null;
  }

  flush(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
  }
}

function makeFakeChannel(): FakeChannel {
  const broadcastCallbacks = new Map<string, (payload: unknown) => void>();
  let statusCallback: ((status: ParticipantRealtimeSubscriptionStatus) => void) | null = null;

  return {
    on(type, filter, callback): FakeChannel {
      assert.equal(type, "broadcast");
      assert.ok(["participants_changed", "room_changed", "result_reveal_ready"].includes(filter.event));
      broadcastCallbacks.set(filter.event, callback);
      return this;
    },
    async send(): Promise<unknown> {
      return "ok";
    },
    subscribe(callback): void {
      statusCallback = callback;
    },
    emitInvalidation(event = "participants_changed"): void {
      broadcastCallbacks.get(event)?.({});
    },
    emitResultReveal(payload): void {
      broadcastCallbacks.get("result_reveal_ready")?.({ payload });
    },
    emitStatus(status): void {
      statusCallback?.(status);
    },
  };
}

test("reuses one channel across a Strict Mode cleanup/remount and ignores stale disposal", () => {
  const cleanupScheduler = new FakeCleanupScheduler();
  const channels: FakeChannel[] = [];
  const removedChannels: FakeChannel[] = [];
  const manager = new RoomParticipantSubscriptionManager(
    {
      channel(): FakeChannel {
        const channel = makeFakeChannel();
        channels.push(channel);
        return channel;
      },
      async removeChannel(channel): Promise<void> {
        removedChannels.push(channel as FakeChannel);
      },
    },
    cleanupScheduler,
  );
  let firstInvalidations = 0;
  let secondInvalidations = 0;
  const firstMount = manager.create("room:11111111-1111-4111-8111-111111111111");
  firstMount.onInvalidation((): void => {
    firstInvalidations += 1;
  });
  firstMount.subscribe((): void => undefined);
  firstMount.dispose();

  const secondMount = manager.create("room:11111111-1111-4111-8111-111111111111");
  secondMount.onInvalidation((): void => {
    secondInvalidations += 1;
  });
  secondMount.subscribe((): void => undefined);
  cleanupScheduler.flush();

  assert.equal(channels.length, 1);
  assert.equal(removedChannels.length, 0);
  const channel = channels.at(0) ?? null;
  assert.ok(channel);
  channel.emitInvalidation();
  channel.emitInvalidation("room_changed");
  assert.equal(firstInvalidations, 0);
  assert.equal(secondInvalidations, 2);

  firstMount.dispose();
  cleanupScheduler.flush();
  assert.equal(removedChannels.length, 0);

  secondMount.dispose();
  cleanupScheduler.flush();
  assert.deepEqual(removedChannels, [channel]);
});

test("fans reconnect status to the current lease without a second subscribe", () => {
  const cleanupScheduler = new FakeCleanupScheduler();
  const channel = makeFakeChannel();
  let channelSubscriptions = 0;
  const originalSubscribe = channel.subscribe;
  channel.subscribe = (callback): void => {
    channelSubscriptions += 1;
    originalSubscribe(callback);
  };
  const manager = new RoomParticipantSubscriptionManager(
    {
      channel: (): FakeChannel => channel,
      removeChannel: async (): Promise<void> => undefined,
    },
    cleanupScheduler,
  );
  const statuses: string[] = [];
  const firstMount = manager.create("room:22222222-2222-4222-8222-222222222222");
  firstMount.subscribe((): void => undefined);
  firstMount.dispose();
  const secondMount = manager.create("room:22222222-2222-4222-8222-222222222222");
  secondMount.subscribe((status): void => {
    statuses.push(status);
  });

  channel.emitStatus("SUBSCRIBED");

  assert.equal(channelSubscriptions, 1);
  assert.deepEqual(statuses, ["SUBSCRIBED"]);
  secondMount.dispose();
  cleanupScheduler.flush();
});

test("delivers only a minimal valid result reveal hint through the shared room channel", async () => {
  const cleanupScheduler = new FakeCleanupScheduler();
  const channel = makeFakeChannel();
  const manager = new RoomParticipantSubscriptionManager(
    {
      channel: (): FakeChannel => channel,
      removeChannel: async (): Promise<void> => undefined,
    },
    cleanupScheduler,
  );
  const subscription = manager.createResultReveal("room:33333333-3333-4333-8333-333333333333");
  const hints: ResultRevealReadyHint[] = [];

  subscription.onResultRevealReady(hint => {
    hints.push(hint);
  });
  channel.emitResultReveal({ roundId: "44444444-4444-4444-8444-444444444444", status: "matched" });
  channel.emitResultReveal({ roundId: "44444444-4444-4444-8444-444444444444", status: "voting" });
  channel.emitResultReveal({ selectedMovieId: 10, status: "matched" });

  assert.deepEqual(hints, [{ roundId: "44444444-4444-4444-8444-444444444444", status: "matched" }]);
  await subscription.publishResultRevealReady({ roundId: "44444444-4444-4444-8444-444444444444", status: "no_match" });
  subscription.dispose();
  cleanupScheduler.flush();
});
