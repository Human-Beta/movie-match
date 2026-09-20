import { assertNever } from "@/lib/assert-never";
import { ROUND_STATUS, isTerminalRoundStatus } from "@/lib/game-rounds/round-status";
import type { PublicParticipantSnapshot } from "@/lib/participants/public-participant-snapshot";

export type ParticipantRoomView = "waiting" | "ready" | "playing" | "result" | "exhausted" | "closed" | "unavailable" | "advanced";

export function getParticipantRoomView(snapshot: PublicParticipantSnapshot): ParticipantRoomView {
  switch (snapshot.roomState) {
    case "waiting":
      return snapshot.participantCount === 2 ? "ready" : "waiting";
    case "playing":
      return snapshot.currentRound !== null && isTerminalRoundStatus(snapshot.currentRound.status) ? "result" : "playing";
    case "exhausted":
      return "exhausted";
    case "matched":
      return snapshot.currentRound?.status === ROUND_STATUS.MATCHED ? "result" : "advanced";
    case "closed":
      return "closed";
    default:
      return assertNever(snapshot.roomState);
  }
}
