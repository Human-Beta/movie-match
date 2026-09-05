"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useState } from "react";

import { readParticipantSnapshotAction } from "@/app/room-participant-actions";
import { createParticipantSnapshotActionRecovery } from "@/app/room-participants/participant-snapshot-action-recovery";
import { RoomParticipantSync } from "@/app/room-participants/room-participant-sync";
import type { ParticipantRealtimeTransportStatus } from "@/app/room-participants/room-participant-sync";
import { createSupabaseRoomParticipantSubscription } from "@/app/room-participants/supabase-room-participant-subscription";
import type { ParticipantSnapshotActionResult, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

type SyncedParticipantSnapshot = {
  realtimeTopic: string;
  snapshot: PublicParticipantSnapshot;
  transportStatus: ParticipantRealtimeTransportStatus;
};

export type RoomParticipantSnapshotState = {
  snapshot: PublicParticipantSnapshot;
  transportStatus: ParticipantRealtimeTransportStatus;
};

export function useRoomParticipantSnapshot({
  initialSnapshot,
  realtimeTopic,
}: Readonly<{
  initialSnapshot: PublicParticipantSnapshot;
  realtimeTopic: string;
}>): RoomParticipantSnapshotState {
  const [syncedState, setSyncedState] = useState<SyncedParticipantSnapshot>({
    realtimeTopic,
    snapshot: initialSnapshot,
    transportStatus: "connecting",
  });
  const initialParticipantCount = initialSnapshot.participantCount;
  const initialRoomState = initialSnapshot.roomState;
  const currentState: RoomParticipantSnapshotState =
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
    const sync = new RoomParticipantSync({
      realtimeTopic,
      initialSnapshot: {
        participantCount: initialParticipantCount,
        participants: [],
        roomState: initialRoomState,
      },
      createSubscription: createSupabaseRoomParticipantSubscription,
      readSnapshot: (): Promise<ParticipantSnapshotActionResult> => readParticipantSnapshotAction(realtimeTopic),
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
          snapshot:
            current.realtimeTopic === realtimeTopic
              ? current.snapshot
              : {
                  participantCount: initialParticipantCount,
                  participants: [],
                  roomState: initialRoomState,
                },
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
  }, [initialParticipantCount, initialRoomState, realtimeTopic]);

  return currentState;
}
