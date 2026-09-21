"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useState } from "react";

import { createParticipantSnapshotActionRecovery } from "@/app/room-participants/participant-snapshot-action-recovery";
import { RoomParticipantSync, type ParticipantRealtimeTransportStatus } from "@/app/room-participants/room-participant-sync";
import { createSupabaseRoomParticipantSubscription } from "@/app/room-participants/supabase-room-participant-subscription";
import type { ParticipantSnapshotActionResult, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

type SyncedParticipantSnapshot<TSnapshot extends PublicParticipantSnapshot> = {
  isNextRoundGenerating: boolean;
  realtimeTopic: string;
  snapshotEpoch: number;
  snapshot: TSnapshot;
  transportStatus: ParticipantRealtimeTransportStatus;
};

export type SyncedParticipantRoomSnapshotState<TSnapshot extends PublicParticipantSnapshot> = {
  isNextRoundGenerating: boolean;
  snapshotEpoch: number;
  snapshot: TSnapshot;
  transportStatus: ParticipantRealtimeTransportStatus;
};

export function useSyncedParticipantRoomSnapshot<TSnapshot extends PublicParticipantSnapshot>({
  initialSnapshot,
  readSnapshot,
  realtimeTopic,
  resetSnapshot,
}: Readonly<{
  initialSnapshot: TSnapshot;
  readSnapshot: () => Promise<ParticipantSnapshotActionResult<TSnapshot>>;
  realtimeTopic: string;
  resetSnapshot: TSnapshot;
}>): SyncedParticipantRoomSnapshotState<TSnapshot> {
  const [syncedState, setSyncedState] = useState<SyncedParticipantSnapshot<TSnapshot>>({
    isNextRoundGenerating: false,
    realtimeTopic,
    snapshotEpoch: 0,
    snapshot: initialSnapshot,
    transportStatus: "connecting",
  });
  const currentState: SyncedParticipantRoomSnapshotState<TSnapshot> =
    syncedState.realtimeTopic === realtimeTopic
      ? syncedState
      : {
          isNextRoundGenerating: false,
          snapshotEpoch: 0,
          snapshot: initialSnapshot,
          transportStatus: "connecting",
        };

  useEffect(() => {
    const actionRecovery = createParticipantSnapshotActionRecovery({
      isUnrecognizedActionError: unstable_isUnrecognizedActionError,
      reload: (): void => {
        window.location.reload();
      },
      storage: window.sessionStorage,
    });
    const sync = new RoomParticipantSync<TSnapshot>({
      realtimeTopic,
      initialSnapshot,
      createSubscription: createSupabaseRoomParticipantSubscription,
      readSnapshot,
      onSnapshot: (nextSnapshot): void => {
        setSyncedState(current => ({
          isNextRoundGenerating: false,
          realtimeTopic,
          snapshotEpoch: current.realtimeTopic === realtimeTopic ? current.snapshotEpoch + 1 : 0,
          snapshot: nextSnapshot,
          transportStatus: current.realtimeTopic === realtimeTopic ? current.transportStatus : "connecting",
        }));
      },
      onNextRoundGenerating: (): void => {
        setSyncedState(current => ({ ...current, isNextRoundGenerating: true, realtimeTopic }));
      },
      onTransportStatus: (transportStatus): void => {
        setSyncedState(current => {
          const sameTopic = current.realtimeTopic === realtimeTopic;
          let snapshotEpoch = sameTopic ? current.snapshotEpoch : 0;

          if (sameTopic && current.transportStatus === "connected" && transportStatus === "disconnected") {
            snapshotEpoch += 1;
          }

          return {
            isNextRoundGenerating: false,
            realtimeTopic,
            snapshotEpoch,
            snapshot: sameTopic ? current.snapshot : resetSnapshot,
            transportStatus,
          };
        });
      },
      onSnapshotReadFailed: (): void => {
        setSyncedState(current => ({
          isNextRoundGenerating: false,
          realtimeTopic,
          snapshotEpoch: current.realtimeTopic === realtimeTopic ? current.snapshotEpoch + 1 : 0,
          snapshot: current.realtimeTopic === realtimeTopic ? current.snapshot : resetSnapshot,
          transportStatus: current.realtimeTopic === realtimeTopic ? current.transportStatus : "connecting",
        }));
      },
      onSnapshotReadFulfilled: (): void => {
        actionRecovery.markActionAvailable();
      },
      onSnapshotReadRejected: (error): boolean => actionRecovery.handleRejectedAction(error),
    });

    sync.start();

    return (): void => {
      sync.stop();
    };
  }, [initialSnapshot, readSnapshot, realtimeTopic, resetSnapshot]);

  return currentState;
}
