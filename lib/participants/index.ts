import "server-only";

import { DrizzleParticipantRepository } from "@/lib/participants/participant-repository";
import { DrizzleParticipantSnapshotRepository } from "@/lib/participants/participant-snapshot-repository";
import { ParticipantSnapshotService, type TvParticipantRoomState } from "@/lib/participants/participant-snapshot-service";
import { ParticipantService, type JoinParticipantInput, type JoinParticipantResult, type JoinRoomView } from "@/lib/participants/participant-service";
import type { ParticipantClientRoomState, PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

const participantService = new ParticipantService(new DrizzleParticipantRepository());
const participantSnapshotService = new ParticipantSnapshotService(new DrizzleParticipantSnapshotRepository());

export function getParticipantJoinRequestExpiresAt(roomCode: string): Promise<Date | null> {
  return participantService.getJoinRequestExpiresAt(roomCode);
}

export function getParticipantJoinView(roomCode: string, storedAccessToken: string | null): Promise<JoinRoomView> {
  return participantService.getJoinRoomView(roomCode, storedAccessToken);
}

export function joinRoomParticipant(input: JoinParticipantInput, storedAccessToken: string | null): Promise<JoinParticipantResult> {
  return participantService.joinParticipant(input, storedAccessToken);
}

export function getTvParticipantRoomState(roomCode: string): Promise<TvParticipantRoomState | null> {
  return participantSnapshotService.getTvRoomState(roomCode);
}

export function getParticipantClientRoomState(roomId: string): Promise<ParticipantClientRoomState | null> {
  return participantSnapshotService.getClientRoomState(roomId);
}

export function getParticipantSnapshotForTopic(realtimeTopic: string): Promise<PublicParticipantSnapshot | null> {
  return participantSnapshotService.getSnapshotForTopic(realtimeTopic);
}
