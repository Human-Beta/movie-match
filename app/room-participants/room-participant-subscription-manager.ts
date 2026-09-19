import type { ParticipantRealtimeSubscriptionStatus, RoomParticipantSubscription } from "@/app/room-participants/room-participant-sync";
import { browserTimerScheduler, type TimerId, type TimerScheduler } from "@/app/room-participants/timer-scheduler";
import { RESULT_REVEAL_READY_EVENT, PARTICIPANTS_CHANGED_EVENT, ROOM_CHANGED_EVENT } from "@/lib/realtime/participant-events";
import { isResultRevealReadyHint, type ResultRevealReadyHint } from "@/lib/realtime/result-reveal-hint";

export type BroadcastChannel = {
  on(type: "broadcast", filter: { event: string }, callback: (payload: unknown) => void): BroadcastChannel;
  send(message: { event: string; payload: ResultRevealReadyHint; type: "broadcast" }): Promise<unknown>;
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
  resultRevealListeners: Set<(hint: ResultRevealReadyHint) => void>;
  statusListeners: Set<(status: ParticipantRealtimeSubscriptionStatus) => void>;
  subscribed: boolean;
};

export type ResultRevealRoomSubscription = {
  dispose(): void;
  onResultRevealReady(callback: (hint: ResultRevealReadyHint) => void): void;
  publishResultRevealReady(hint: ResultRevealReadyHint): Promise<void>;
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

  createResultReveal(realtimeTopic: string): ResultRevealRoomSubscription {
    const sharedChannel = this.getOrCreateSharedChannel(realtimeTopic);
    let disposed = false;
    let resultRevealListener: ((hint: ResultRevealReadyHint) => void) | null = null;

    sharedChannel.ownerCount += 1;
    this.subscribeSharedChannel(sharedChannel);

    return {
      onResultRevealReady: (callback): void => {
        if (disposed) {
          return;
        }

        if (resultRevealListener !== null) {
          sharedChannel.resultRevealListeners.delete(resultRevealListener);
        }

        resultRevealListener = callback;
        sharedChannel.resultRevealListeners.add(callback);
      },
      publishResultRevealReady: async (hint): Promise<void> => {
        if (disposed) {
          return;
        }

        try {
          await sharedChannel.channel.send({ event: RESULT_REVEAL_READY_EVENT, payload: hint, type: "broadcast" });
        } catch {
          // Phones have a bounded authoritative-snapshot fallback when the TV hint is lost.
        }
      },
      dispose: (): void => {
        if (disposed) {
          return;
        }

        disposed = true;

        if (resultRevealListener !== null) {
          sharedChannel.resultRevealListeners.delete(resultRevealListener);
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
      resultRevealListeners: new Set(),
      statusListeners: new Set(),
      subscribed: false,
    };

    const invalidate = (): void => {
      for (const listener of sharedChannel.invalidationListeners) {
        listener();
      }
    };
    const receiveResultReveal = (event: unknown): void => {
      const payload = typeof event === "object" && event !== null && "payload" in event ? (event as { payload: unknown }).payload : event;

      if (!isResultRevealReadyHint(payload)) {
        return;
      }

      for (const listener of sharedChannel.resultRevealListeners) {
        listener(payload);
      }
    };
    channel
      .on("broadcast", { event: PARTICIPANTS_CHANGED_EVENT }, invalidate)
      .on("broadcast", { event: ROOM_CHANGED_EVENT }, invalidate)
      .on("broadcast", { event: RESULT_REVEAL_READY_EVENT }, receiveResultReveal);
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
