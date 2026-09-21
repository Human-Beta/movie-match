"use server";

import "server-only";

import { cookies } from "next/headers";

import { confirmNoMatchNextRound } from "@/lib/no-match-next-round";
import { nextRoundInputSchema, type NextRoundInput } from "@/lib/no-match-next-round/next-round-input";
import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import { notifyRoomChanged } from "@/lib/realtime/participant-broadcast-server";

export type PublicNextRoundResult =
  | { status: "ready" }
  | { status: "started" }
  | { status: "list_exhausted" }
  | { status: "unavailable" }
  | { status: "validation_error" }
  | { status: "conflict" }
  | { status: "error" };

export async function confirmNoMatchNextRoundAction(input: NextRoundInput): Promise<PublicNextRoundResult> {
  const parsed = nextRoundInputSchema.safeParse(input);

  if (!parsed.success) {
    return { status: "validation_error" };
  }

  try {
    const cookieStore = await cookies();
    const storedAccessToken = cookieStore.get(getParticipantCookieName(parsed.data.roomCode))?.value ?? null;
    const result = await confirmNoMatchNextRound(parsed.data, storedAccessToken);

    if (result.status !== "completed") {
      return result;
    }

    try {
      await notifyRoomChanged(result.roomId);
    } catch {
      // Snapshot polling recovers authoritative state after a transport failure.
    }

    return { status: result.outcome };
  } catch {
    console.error("Failed to confirm no-match next round.");
    return { status: "error" };
  }
}
