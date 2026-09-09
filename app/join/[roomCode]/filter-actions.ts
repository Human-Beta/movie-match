"use server";

import "server-only";

import { cookies } from "next/headers";

import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import { saveRoomFiltersInputSchema, type SaveRoomFiltersInput } from "@/lib/room-filters/room-filter-input";
import { DrizzleRoomFilterRepository } from "@/lib/room-filters/room-filter-repository";
import { RoomFilterService } from "@/lib/room-filters/room-filter-service";
import type { ReadRoomFiltersResult, SaveRoomFiltersResult } from "@/lib/room-filters/room-filter-values";
import { roomCodeSchema } from "@/lib/rooms/room-code";

const service = new RoomFilterService(new DrizzleRoomFilterRepository());

export async function readRoomFiltersAction(roomCode: string): Promise<ReadRoomFiltersResult> {
  const parsed = roomCodeSchema.safeParse(roomCode);
  if (!parsed.success) {
    return { status: "unavailable" };
  }
  try {
    const cookieStore = await cookies();
    return await service.read(parsed.data, cookieStore.get(getParticipantCookieName(parsed.data))?.value ?? null);
  } catch {
    console.error("Failed to read room filters.");
    return { status: "error" };
  }
}

export async function saveRoomFiltersAction(input: SaveRoomFiltersInput): Promise<SaveRoomFiltersResult> {
  const parsed = saveRoomFiltersInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "validation_error" };
  }
  try {
    const cookieStore = await cookies();
    return await service.save(parsed.data, cookieStore.get(getParticipantCookieName(parsed.data.roomCode))?.value ?? null);
  } catch {
    console.error("Failed to save room filters.");
    return { status: "error" };
  }
}
