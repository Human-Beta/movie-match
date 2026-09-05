import type { JoinParticipantResult, ParticipantRole } from "@/lib/participants/participant-service";
import type { ParticipantClientRoomState } from "@/lib/participants/public-participant-snapshot";

export type PublicParticipantIdentity = {
  name: string;
  role: ParticipantRole;
};

export type JoinRoomActionState =
  | { status: "form" }
  | { status: "validation_error"; message: string }
  | { status: "unavailable" }
  | { status: "full" }
  | { status: "error"; message: string }
  | { status: "joined"; participant: PublicParticipantIdentity; room: ParticipantClientRoomState };

export function toJoinRoomActionState(result: JoinParticipantResult, room: ParticipantClientRoomState | null): JoinRoomActionState {
  if (result.status !== "joined") {
    return result;
  }

  if (room === null) {
    return { status: "unavailable" };
  }

  return {
    status: "joined",
    participant: {
      name: result.participant.name,
      role: result.participant.role,
    },
    room,
  };
}
