import "server-only";

import { DrizzleParticipantRepository } from "@/lib/participants/participant-repository";
import { ParticipantService, type JoinParticipantInput, type JoinParticipantResult, type JoinRoomView } from "@/lib/participants/participant-service";

const participantService = new ParticipantService(new DrizzleParticipantRepository());

export function getParticipantJoinRequestExpiresAt(roomCode: string): Promise<Date | null> {
  return participantService.getJoinRequestExpiresAt(roomCode);
}

export function getParticipantJoinView(roomCode: string, storedAccessToken: string | null): Promise<JoinRoomView> {
  return participantService.getJoinRoomView(roomCode, storedAccessToken);
}

export function joinRoomParticipant(input: JoinParticipantInput, storedAccessToken: string | null): Promise<JoinParticipantResult> {
  return participantService.joinParticipant(input, storedAccessToken);
}
