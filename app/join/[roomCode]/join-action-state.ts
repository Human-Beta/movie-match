import type { JoinParticipantResult, ParticipantRole } from "@/lib/participants/participant-service";

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
  | { status: "joined"; participant: PublicParticipantIdentity };

export function toJoinRoomActionState(result: JoinParticipantResult): JoinRoomActionState {
  if (result.status !== "joined") {
    return result;
  }

  return {
    status: "joined",
    participant: {
      name: result.participant.name,
      role: result.participant.role,
    },
  };
}
