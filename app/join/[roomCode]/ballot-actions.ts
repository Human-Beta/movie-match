"use server";

import "server-only";

import { cookies } from "next/headers";

import { submitBallot } from "@/lib/ballots";
import { ballotInputSchema, type BallotInput } from "@/lib/ballots/ballot-input";
import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import { notifyRoomChanged } from "@/lib/realtime/participant-broadcast-server";

export type PublicBallotSubmissionResult =
  | { status: "submitted"; submittedCount: number }
  | { status: "unavailable" }
  | { status: "validation_error" }
  | { status: "conflict" }
  | { status: "error" };

export async function submitBallotAction(input: BallotInput): Promise<PublicBallotSubmissionResult> {
  const parsed = ballotInputSchema.safeParse(input);

  if (!parsed.success) {
    return { status: "validation_error" };
  }

  try {
    const cookieStore = await cookies();
    const storedAccessToken = cookieStore.get(getParticipantCookieName(parsed.data.roomCode))?.value ?? null;
    const result = await submitBallot(parsed.data, storedAccessToken);

    if (result.status !== "completed") {
      return result;
    }

    try {
      await notifyRoomChanged(result.roomId);
    } catch {
      // The active voting snapshot's bounded refetch restores committed progress.
    }

    return { status: "submitted", submittedCount: result.submittedCount };
  } catch {
    console.error("Failed to submit a ballot.");
    return { status: "error" };
  }
}
