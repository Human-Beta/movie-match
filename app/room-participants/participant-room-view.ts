import { assertNever } from "@/lib/assert-never";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

export type ParticipantRoomView = "waiting" | "ready" | "playing" | "exhausted" | "unavailable" | "advanced";

export function getParticipantRoomView(snapshot: PublicParticipantSnapshot): ParticipantRoomView {
  switch (snapshot.roomState) {
    case "waiting":
      return snapshot.participantCount === 2 ? "ready" : "waiting";
    case "playing":
      return "playing";
    case "exhausted":
      return "exhausted";
    case "matched":
      return "advanced";
    case "closed":
      return "unavailable";
    default:
      return assertNever(snapshot.roomState);
  }
}
