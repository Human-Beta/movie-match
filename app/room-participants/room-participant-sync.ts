import type { ParticipantSnapshotActionResult, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";
import { assertNever } from "@/lib/assert-never";
import { browserTimerScheduler, type TimerId, type TimerScheduler } from "@/app/room-participants/timer-scheduler";

export const PARTICIPANT_SNAPSHOT_COALESCE_MS = 100;
export const PARTICIPANT_SNAPSHOT_POLL_MS = 5_000;

export type ParticipantRealtimeTransportStatus = "connecting" | "connected" | "disconnected";
export type ParticipantRealtimeSubscriptionStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export type RoomParticipantSubscription = {
  onInvalidation(callback: () => void): void;
  subscribe(callback: (status: ParticipantRealtimeSubscriptionStatus) => void): void;
  dispose(): void;
};

export type ParticipantSyncScheduler = TimerScheduler;

export type RoomParticipantSyncOptions = {
  realtimeTopic: string;
  initialSnapshot: PublicParticipantSnapshot;
  createSubscription: (realtimeTopic: string) => RoomParticipantSubscription;
  readSnapshot: () => Promise<ParticipantSnapshotActionResult>;
  onSnapshot: (snapshot: PublicParticipantSnapshot) => void;
  onTransportStatus?: (status: ParticipantRealtimeTransportStatus) => void;
  onSnapshotReadFulfilled?: () => void;
  onSnapshotReadRejected?: (error: unknown) => boolean;
  scheduler?: ParticipantSyncScheduler;
  coalesceMs?: number;
  pollMs?: number;
};

function shouldPoll(snapshot: PublicParticipantSnapshot): boolean {
  return snapshot.roomState === "waiting" && snapshot.participantCount < 2;
}

function toTransportStatus(status: ParticipantRealtimeSubscriptionStatus): ParticipantRealtimeTransportStatus {
  if (status === "SUBSCRIBED") {
    return "connected";
  }

  return "disconnected";
}

export class RoomParticipantSync {
  private readonly coalesceMs: number;
  private readonly createSubscription: RoomParticipantSyncOptions["createSubscription"];
  private readonly onSnapshot: RoomParticipantSyncOptions["onSnapshot"];
  private readonly onSnapshotReadFulfilled: RoomParticipantSyncOptions["onSnapshotReadFulfilled"];
  private readonly onSnapshotReadRejected: RoomParticipantSyncOptions["onSnapshotReadRejected"];
  private readonly onTransportStatus: RoomParticipantSyncOptions["onTransportStatus"];
  private readonly pollMs: number;
  private readonly readSnapshot: RoomParticipantSyncOptions["readSnapshot"];
  private readonly realtimeTopic: string;
  private readonly scheduler: ParticipantSyncScheduler;

  private active = false;
  private currentSnapshot: PublicParticipantSnapshot;
  private currentTransportStatus: ParticipantRealtimeTransportStatus = "connecting";
  private generation = 0;
  private pollTimer: TimerId | null = null;
  private refreshInFlight = false;
  private refreshQueued = false;
  private refreshTimer: TimerId | null = null;
  private subscription: RoomParticipantSubscription | null = null;

  constructor(options: RoomParticipantSyncOptions) {
    this.coalesceMs = options.coalesceMs ?? PARTICIPANT_SNAPSHOT_COALESCE_MS;
    this.createSubscription = options.createSubscription;
    this.currentSnapshot = options.initialSnapshot;
    this.onSnapshot = options.onSnapshot;
    this.onSnapshotReadFulfilled = options.onSnapshotReadFulfilled;
    this.onSnapshotReadRejected = options.onSnapshotReadRejected;
    this.onTransportStatus = options.onTransportStatus;
    this.pollMs = options.pollMs ?? PARTICIPANT_SNAPSHOT_POLL_MS;
    this.readSnapshot = options.readSnapshot;
    this.realtimeTopic = options.realtimeTopic;
    this.scheduler = options.scheduler ?? browserTimerScheduler;
  }

  start(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.generation += 1;
    this.subscription = this.createSubscription(this.realtimeTopic);
    this.subscription.onInvalidation(() => {
      this.requestRefresh();
    });
    this.subscription.subscribe(status => {
      this.updateTransportStatus(toTransportStatus(status));

      if (status === "SUBSCRIBED") {
        this.requestRefresh();
      }
    });
    this.requestRefresh();
    this.updatePolling();
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.generation += 1;
    this.refreshQueued = false;
    this.clearRefreshTimer();
    this.clearPollTimer();
    this.subscription?.dispose();
    this.subscription = null;
  }

  private requestRefresh(): void {
    if (!this.active) {
      return;
    }

    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }

    if (this.refreshTimer !== null) {
      return;
    }

    const generation = this.generation;
    this.refreshTimer = this.scheduler.setTimeout(() => {
      this.refreshTimer = null;
      void this.runRefresh(generation);
    }, this.coalesceMs);
  }

  private async runRefresh(generation: number): Promise<void> {
    if (!this.isGenerationActive(generation)) {
      return;
    }

    this.refreshInFlight = true;

    try {
      const result = await this.readSnapshot();

      if (!this.isGenerationActive(generation)) {
        return;
      }

      this.onSnapshotReadFulfilled?.();
      this.applyResult(result);
    } catch (error) {
      if (!this.isGenerationActive(generation)) {
        return;
      }

      let recoveryStarted = false;

      try {
        recoveryStarted = this.onSnapshotReadRejected?.(error) ?? false;
      } catch {
        recoveryStarted = false;
      }

      if (recoveryStarted && this.isGenerationActive(generation)) {
        this.stop();
      }
    } finally {
      this.refreshInFlight = false;

      if (this.isGenerationActive(generation) && this.refreshQueued) {
        this.refreshQueued = false;
        this.requestRefresh();
      }
    }
  }

  private applyResult(result: ParticipantSnapshotActionResult): void {
    switch (result.status) {
      case "ready":
        this.currentSnapshot = result.snapshot;
        this.onSnapshot(result.snapshot);
        this.updatePolling();
        return;
      case "unavailable":
        this.currentSnapshot = { ...this.currentSnapshot, roomState: "closed" };
        this.onSnapshot(this.currentSnapshot);
        this.updatePolling();
        return;
      case "error":
        return;
      default:
        return assertNever(result);
    }
  }

  private isGenerationActive(generation: number): boolean {
    return this.active && generation === this.generation;
  }

  private updatePolling(): void {
    if (!this.active || !shouldPoll(this.currentSnapshot)) {
      this.clearPollTimer();
      return;
    }

    if (this.pollTimer !== null) {
      return;
    }

    this.pollTimer = this.scheduler.setTimeout(() => {
      this.pollTimer = null;
      this.requestRefresh();
      this.updatePolling();
    }, this.pollMs);
  }

  private updateTransportStatus(status: ParticipantRealtimeTransportStatus): void {
    if (status === this.currentTransportStatus) {
      return;
    }

    this.currentTransportStatus = status;
    this.onTransportStatus?.(status);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer !== null) {
      this.scheduler.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      this.scheduler.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
