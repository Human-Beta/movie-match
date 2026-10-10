"use client";

import { useCallback, useMemo } from "react";

import { readParticipantSnapshotAction } from "@/app/room-participant-actions";
import {
  useSyncedParticipantRoomSnapshot,
  type SyncedParticipantRoomSnapshotState,
} from "@/app/room-participants/use-synced-participant-room-snapshot";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

export type RoomParticipantSnapshotState = SyncedParticipantRoomSnapshotState<PublicParticipantSnapshot>;

export function useRoomParticipantSnapshot({
  initialSnapshot,
  realtimeTopic,
}: Readonly<{
  initialSnapshot: PublicParticipantSnapshot;
  realtimeTopic: string;
}>): RoomParticipantSnapshotState {
  const readSnapshot = useCallback(() => readParticipantSnapshotAction(realtimeTopic), [realtimeTopic]);
  const resetSnapshot = useMemo<PublicParticipantSnapshot>(
    () => ({
      expiresAt: initialSnapshot.expiresAt,
      ballotProgress: null,
      currentRound: null,
      participantCount: initialSnapshot.participantCount,
      participants: [],
      roomState: initialSnapshot.roomState,
    }),
    [initialSnapshot.expiresAt, initialSnapshot.participantCount, initialSnapshot.roomState],
  );

  return useSyncedParticipantRoomSnapshot({
    initialSnapshot,
    readSnapshot,
    realtimeTopic,
    resetSnapshot,
  });
}
