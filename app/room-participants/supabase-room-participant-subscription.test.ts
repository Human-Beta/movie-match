import assert from "node:assert/strict";
import test from "node:test";

import { RoomParticipantSubscriptionManager, type SubscriptionCleanupScheduler } from "@/app/room-participants/room-participant-subscription-manager";
import type { ParticipantRealtimeSubscriptionStatus } from "@/app/room-participants/room-participant-sync";

type FakeChannel = {
  on(type: "broadcast", filter: { event: string }, callback: () => void): FakeChannel;
  subscribe(callback: (status: ParticipantRealtimeSubscriptionStatus) => void): void;
  emitInvalidation(): void;
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
  let invalidationCallback: (() => void) | null = null;
  let statusCallback: ((status: ParticipantRealtimeSubscriptionStatus) => void) | null = null;

  return {
    on(type, filter, callback): FakeChannel {
      assert.equal(type, "broadcast");
      assert.equal(filter.event, "participants_changed");
      invalidationCallback = callback;
      return this;
    },
    subscribe(callback): void {
      statusCallback = callback;
    },
    emitInvalidation(): void {
      invalidationCallback?.();
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
  assert.equal(firstInvalidations, 0);
  assert.equal(secondInvalidations, 1);

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
