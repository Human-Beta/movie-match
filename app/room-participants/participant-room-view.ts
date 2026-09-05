import { assertNever } from "@/lib/assert-never";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

export type ParticipantRoomView = "waiting" | "ready" | "unavailable" | "advanced";

export function getParticipantRoomView(snapshot: PublicParticipantSnapshot): ParticipantRoomView {
  switch (snapshot.roomState) {
    case "waiting":
      return snapshot.participantCount === 2 ? "ready" : "waiting";
    case "playing":
    case "matched":
    case "exhausted":
      return "advanced";
    case "closed":
      return "unavailable";
    default:
      return assertNever(snapshot.roomState);
  }
}
