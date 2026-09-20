import { assertNever } from "@/lib/assert-never";
import type { PublicBallotSubmissionResult } from "@/app/join/[roomCode]/ballot-actions";

export type BallotFeedback = "idle" | "incomplete" | "retry" | "storage" | "submitted" | "unavailable" | "validation_error" | "conflict";

export function applyTerminalBallotSubmissionResult({
  onSubmitted,
  result,
  roundId,
  setFeedback,
}: Readonly<{
  onSubmitted(roundId: string, submittedCount: number): void;
  result: Exclude<PublicBallotSubmissionResult, { status: "error" }>;
  roundId: string;
  setFeedback(feedback: BallotFeedback): void;
}>): void {
  switch (result.status) {
    case "submitted":
      onSubmitted(roundId, result.submittedCount);
      setFeedback(result.status);
      return;
    case "unavailable":
    case "validation_error":
    case "conflict":
      setFeedback(result.status);
      return;
    default:
      return assertNever(result);
  }
}

export function shouldShowBallotFeedback(feedback: BallotFeedback, readyForResults: boolean): feedback is Exclude<BallotFeedback, "idle"> {
  return feedback !== "idle" && !(readyForResults && feedback === "submitted");
}
