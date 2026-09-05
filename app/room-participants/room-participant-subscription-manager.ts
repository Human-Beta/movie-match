import type { ParticipantRealtimeSubscriptionStatus, RoomParticipantSubscription } from "@/app/room-participants/room-participant-sync";
import { browserTimerScheduler, type TimerId, type TimerScheduler } from "@/app/room-participants/timer-scheduler";
import { PARTICIPANTS_CHANGED_EVENT } from "@/lib/realtime/participant-events";

export type BroadcastChannel = {
  on(type: "broadcast", filter: { event: string }, callback: () => void): BroadcastChannel;
  subscribe(callback: (status: ParticipantRealtimeSubscriptionStatus) => void): void;
};

export type RealtimeAdapter<TChannel extends BroadcastChannel> = {
  channel(topic: string): TChannel;
  removeChannel(channel: TChannel): Promise<void>;
};

export type SubscriptionCleanupScheduler = TimerScheduler;

type SharedRoomChannel<TChannel extends BroadcastChannel> = {
  channel: TChannel;
  cleanupTimer: TimerId | null;
  invalidationListeners: Set<() => void>;
  ownerCount: number;
  statusListeners: Set<(status: ParticipantRealtimeSubscriptionStatus) => void>;
  subscribed: boolean;
};

export class RoomParticipantSubscriptionManager<TChannel extends BroadcastChannel> {
  private readonly channels = new Map<string, SharedRoomChannel<TChannel>>();

  constructor(
    private readonly realtimeAdapter: RealtimeAdapter<TChannel>,
    private readonly cleanupScheduler: SubscriptionCleanupScheduler = browserTimerScheduler,
  ) {}

  create(realtimeTopic: string): RoomParticipantSubscription {
    const sharedChannel = this.getOrCreateSharedChannel(realtimeTopic);
    let disposed = false;
    let invalidationListener: (() => void) | null = null;
    let statusListener: ((status: ParticipantRealtimeSubscriptionStatus) => void) | null = null;

    sharedChannel.ownerCount += 1;

    return {
      onInvalidation: (callback): void => {
        if (disposed) {
          return;
        }

        if (invalidationListener !== null) {
          sharedChannel.invalidationListeners.delete(invalidationListener);
        }

        invalidationListener = callback;
        sharedChannel.invalidationListeners.add(callback);
      },
      subscribe: (callback): void => {
        if (disposed) {
          return;
        }

        if (statusListener !== null) {
          sharedChannel.statusListeners.delete(statusListener);
        }

        statusListener = callback;
        sharedChannel.statusListeners.add(callback);
        this.subscribeSharedChannel(sharedChannel);
      },
      dispose: (): void => {
        if (disposed) {
          return;
        }

        disposed = true;

        if (invalidationListener !== null) {
          sharedChannel.invalidationListeners.delete(invalidationListener);
        }

        if (statusListener !== null) {
          sharedChannel.statusListeners.delete(statusListener);
        }

        sharedChannel.ownerCount -= 1;

        if (sharedChannel.ownerCount === 0) {
          this.scheduleCleanup(realtimeTopic, sharedChannel);
        }
      },
    };
  }

  private getOrCreateSharedChannel(realtimeTopic: string): SharedRoomChannel<TChannel> {
    const existingChannel = this.channels.get(realtimeTopic) ?? null;

    if (existingChannel !== null) {
      if (existingChannel.cleanupTimer !== null) {
        this.cleanupScheduler.clearTimeout(existingChannel.cleanupTimer);
        existingChannel.cleanupTimer = null;
      }

      return existingChannel;
    }

    const channel = this.realtimeAdapter.channel(realtimeTopic);
    const sharedChannel: SharedRoomChannel<TChannel> = {
      channel,
      cleanupTimer: null,
      invalidationListeners: new Set(),
      ownerCount: 0,
      statusListeners: new Set(),
      subscribed: false,
    };

    channel.on("broadcast", { event: PARTICIPANTS_CHANGED_EVENT }, () => {
      for (const listener of sharedChannel.invalidationListeners) {
        listener();
      }
    });
    this.channels.set(realtimeTopic, sharedChannel);

    return sharedChannel;
  }

  private subscribeSharedChannel(sharedChannel: SharedRoomChannel<TChannel>): void {
    if (sharedChannel.subscribed) {
      return;
    }

    sharedChannel.subscribed = true;
    sharedChannel.channel.subscribe(status => {
      for (const listener of sharedChannel.statusListeners) {
        listener(status);
      }
    });
  }

  private scheduleCleanup(realtimeTopic: string, sharedChannel: SharedRoomChannel<TChannel>): void {
    if (sharedChannel.cleanupTimer !== null) {
      return;
    }

    sharedChannel.cleanupTimer = this.cleanupScheduler.setTimeout(() => {
      sharedChannel.cleanupTimer = null;

      if (sharedChannel.ownerCount !== 0 || this.channels.get(realtimeTopic) !== sharedChannel) {
        return;
      }

      this.channels.delete(realtimeTopic);
      void this.realtimeAdapter.removeChannel(sharedChannel.channel).catch(() => undefined);
    }, 0);
  }
}
