"use server";

import "server-only";

import { getParticipantSnapshotForTopic } from "@/lib/participants";
import type { ParticipantSnapshotActionResult } from "@/lib/participants/public-participant-snapshot";

export async function readParticipantSnapshotAction(realtimeTopic: string): Promise<ParticipantSnapshotActionResult> {
  try {
    const snapshot = await getParticipantSnapshotForTopic(realtimeTopic);

    return snapshot === null ? { status: "unavailable" } : { status: "ready", snapshot };
  } catch {
    console.error("Failed to read the participant snapshot.");

    return { status: "error" };
  }
}
