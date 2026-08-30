"use server";

import "server-only";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { resolveTvRoom, RoomCreationRequestUnavailableError } from "@/lib/rooms";
import { roomCodeSchema } from "@/lib/rooms/room-code";

export type OpenTvRoomInput = {
  savedRoomCode: string | null;
  creationRequestId: string;
};

const openTvRoomInputSchema = z
  .object({
    savedRoomCode: roomCodeSchema.nullable().catch(null),
    creationRequestId: z.uuid(),
  })
  .strict() satisfies z.ZodType<OpenTvRoomInput>;

export type OpenTvRoomResult =
  | { status: "ready"; roomCode: string }
  | {
      status: "error";
      message: string;
      resetCreationRequest?: true;
    };

export async function openTvRoom(input: OpenTvRoomInput): Promise<OpenTvRoomResult> {
  const t = await getTranslations("TvPage");
  const parsedInput = openTvRoomInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      status: "error",
      message: t("savedRoomCheckFailure"),
      resetCreationRequest: true,
    };
  }

  try {
    const room = await resolveTvRoom(parsedInput.data.savedRoomCode, parsedInput.data.creationRequestId);

    return { status: "ready", roomCode: room.code };
  } catch (error) {
    if (error instanceof RoomCreationRequestUnavailableError) {
      return {
        status: "error",
        message: t("previousRoomUnavailable"),
        resetCreationRequest: true,
      };
    }

    console.error("Failed to open a TV room.", error);

    return {
      status: "error",
      message: t("openFailure"),
    };
  }
}
