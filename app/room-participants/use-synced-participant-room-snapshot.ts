"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useState } from "react";

import { createParticipantSnapshotActionRecovery } from "@/app/room-participants/participant-snapshot-action-recovery";
import { RoomParticipantSync, type ParticipantRealtimeTransportStatus } from "@/app/room-participants/room-participant-sync";
import { createSupabaseRoomParticipantSubscription } from "@/app/room-participants/supabase-room-participant-subscription";
import type { ParticipantSnapshotActionResult, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

type SyncedParticipantSnapshot<TSnapshot extends PublicParticipantSnapshot> = {
  realtimeTopic: string;
  snapshot: TSnapshot;
  transportStatus: ParticipantRealtimeTransportStatus;
};

export type SyncedParticipantRoomSnapshotState<TSnapshot extends PublicParticipantSnapshot> = {
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
    realtimeTopic,
    snapshot: initialSnapshot,
    transportStatus: "connecting",
  });
  const currentState: SyncedParticipantRoomSnapshotState<TSnapshot> =
    syncedState.realtimeTopic === realtimeTopic
      ? syncedState
      : {
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
          realtimeTopic,
          snapshot: nextSnapshot,
          transportStatus: current.realtimeTopic === realtimeTopic ? current.transportStatus : "connecting",
        }));
      },
      onTransportStatus: (transportStatus): void => {
        setSyncedState(current => ({
          realtimeTopic,
          snapshot: current.realtimeTopic === realtimeTopic ? current.snapshot : resetSnapshot,
          transportStatus,
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
