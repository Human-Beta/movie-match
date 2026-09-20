import assert from "node:assert/strict";
import test from "node:test";

import { applyTerminalBallotSubmissionResult, shouldShowBallotFeedback, type BallotFeedback } from "@/app/join/[roomCode]/ballot-feedback";
import type { PublicBallotSubmissionResult } from "@/app/join/[roomCode]/ballot-actions";

const roundId = "11111111-1111-4111-8111-111111111111";

test("projects only a confirmed submitted result", () => {
  const submitted: Array<{ roundId: string; submittedCount: number }> = [];
  const feedback: BallotFeedback[] = [];

  applyTerminalBallotSubmissionResult({
    onSubmitted: (nextRoundId, submittedCount): void => {
      submitted.push({ roundId: nextRoundId, submittedCount });
    },
    result: { status: "submitted", submittedCount: 2 },
    roundId,
    setFeedback: nextFeedback => {
      feedback.push(nextFeedback);
    },
  });

  assert.deepEqual(submitted, [{ roundId, submittedCount: 2 }]);
  assert.deepEqual(feedback, ["submitted"]);
});

test("does not project rejected terminal ballot results", () => {
  const rejectedResults: readonly Exclude<PublicBallotSubmissionResult, { status: "error" | "submitted" }>[] = [
    { status: "unavailable" },
    { status: "validation_error" },
    { status: "conflict" },
  ];

  for (const result of rejectedResults) {
    const submitted: Array<{ roundId: string; submittedCount: number }> = [];
    const feedback: BallotFeedback[] = [];

    applyTerminalBallotSubmissionResult({
      onSubmitted: (nextRoundId, submittedCount): void => {
        submitted.push({ roundId: nextRoundId, submittedCount });
      },
      result,
      roundId,
      setFeedback: nextFeedback => {
        feedback.push(nextFeedback);
      },
    });

    assert.deepEqual(submitted, []);
    assert.deepEqual(feedback, [result.status]);
  }
});

test("hides only the submitted feedback when results are ready", () => {
  assert.equal(shouldShowBallotFeedback("submitted", false), true);
  assert.equal(shouldShowBallotFeedback("submitted", true), false);
  assert.equal(shouldShowBallotFeedback("idle", false), false);
  assert.equal(shouldShowBallotFeedback("conflict", true), true);
});
