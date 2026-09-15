"use client";

import { useCallback, useMemo } from "react";

import { readParticipantClientSnapshotAction } from "@/app/room-participant-actions";
import {
  useSyncedParticipantRoomSnapshot,
  type SyncedParticipantRoomSnapshotState,
} from "@/app/room-participants/use-synced-participant-room-snapshot";
import type { ParticipantClientSnapshot } from "@/lib/participants/public-participant-snapshot";

export type AuthenticatedParticipantRoomSnapshotState = SyncedParticipantRoomSnapshotState<ParticipantClientSnapshot>;

export function useAuthenticatedParticipantRoomSnapshot({
  initialSnapshot,
  realtimeTopic,
  roomCode,
}: Readonly<{
  initialSnapshot: ParticipantClientSnapshot;
  realtimeTopic: string;
  roomCode: string;
}>): AuthenticatedParticipantRoomSnapshotState {
  const readSnapshot = useCallback(() => readParticipantClientSnapshotAction(realtimeTopic, roomCode), [realtimeTopic, roomCode]);
  const resetSnapshot = useMemo<ParticipantClientSnapshot>(
    () => ({
      ballotProgress: null,
      currentRound: null,
      ownBallot: null,
      participantCount: initialSnapshot.participantCount,
      participants: [],
      roomState: initialSnapshot.roomState,
    }),
    [initialSnapshot.participantCount, initialSnapshot.roomState],
  );

  return useSyncedParticipantRoomSnapshot({
    initialSnapshot,
    readSnapshot,
    realtimeTopic,
    resetSnapshot,
  });
}
