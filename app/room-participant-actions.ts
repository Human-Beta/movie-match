"use server";

import "server-only";

import { cookies } from "next/headers";

import { getParticipantSnapshotForTopic, getParticipantSnapshotForTopicForParticipant } from "@/lib/participants";
import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import type { ParticipantClientSnapshot, ParticipantSnapshotActionResult } from "@/lib/participants/public-participant-snapshot";
import { roomCodeSchema } from "@/lib/rooms/room-code";

export async function readParticipantSnapshotAction(realtimeTopic: string): Promise<ParticipantSnapshotActionResult> {
  try {
    const snapshot = await getParticipantSnapshotForTopic(realtimeTopic);

    return snapshot === null ? { status: "unavailable" } : { status: "ready", snapshot };
  } catch {
    console.error("Failed to read the participant snapshot.");

    return { status: "error" };
  }
}

export async function readParticipantClientSnapshotAction(
  realtimeTopic: string,
  roomCode: string,
): Promise<ParticipantSnapshotActionResult<ParticipantClientSnapshot>> {
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);

  if (!parsedRoomCode.success) {
    return { status: "unavailable" };
  }

  try {
    const cookieStore = await cookies();
    const storedAccessToken = cookieStore.get(getParticipantCookieName(parsedRoomCode.data))?.value ?? null;
    const snapshot = await getParticipantSnapshotForTopicForParticipant(realtimeTopic, storedAccessToken);

    return snapshot === null ? { status: "unavailable" } : { status: "ready", snapshot };
  } catch {
    console.error("Failed to read the participant client snapshot.");

    return { status: "error" };
  }
}
