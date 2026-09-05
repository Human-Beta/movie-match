import type { ParticipantRole } from "@/lib/participants/participant-service";
import type { RoomStatus } from "@/lib/rooms/room-service";

export type PublicRoomParticipant = {
  name: string;
  role: ParticipantRole;
};

export type PublicParticipantSnapshot = {
  roomState: RoomStatus;
  participantCount: number;
  participants: PublicRoomParticipant[];
};

export type ParticipantClientRoomState = {
  realtimeTopic: string;
  snapshot: PublicParticipantSnapshot;
};

export type ParticipantSnapshotActionResult =
  { status: "ready"; snapshot: PublicParticipantSnapshot } | { status: "unavailable" } | { status: "error" };
