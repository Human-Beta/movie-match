"use server";

import "server-only";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import type { JoinRoomActionState } from "@/app/join/[roomCode]/join-action-state";
import { toJoinRoomActionState } from "@/app/join/[roomCode]/join-action-state";
import { getParticipantJoinRequestExpiresAt, joinRoomParticipant } from "@/lib/participants";
import { joinRoomInputSchema } from "@/lib/participants/join-input";
import {
  getExpiredParticipantCookieOptions,
  getParticipantCookieName,
  getParticipantCookieOptions,
  getParticipantJoinRequestCookieName,
} from "@/lib/participants/participant-cookie";
import { generateParticipantAccessToken, parseParticipantAccessToken } from "@/lib/participants/participant-token";
import { roomCodeSchema } from "@/lib/rooms/room-code";

export type PrepareJoinRoomResult = { status: "ready" } | { status: "error"; message: string };

export async function prepareJoinRoomAction(roomCode: string): Promise<PrepareJoinRoomResult> {
  const t = await getTranslations("JoinRoom");
  const parsedRoomCode = roomCodeSchema.safeParse(roomCode);

  if (!parsedRoomCode.success) {
    return { status: "error", message: t("status.unavailableDescription") };
  }

  try {
    const expiresAt = await getParticipantJoinRequestExpiresAt(parsedRoomCode.data);

    if (!expiresAt) {
      return { status: "error", message: t("status.unavailableDescription") };
    }

    const cookieStore = await cookies();
    const cookieName = getParticipantJoinRequestCookieName(parsedRoomCode.data);
    const storedJoinRequestToken = cookieStore.get(cookieName)?.value ?? null;
    const joinRequestToken = parseParticipantAccessToken(storedJoinRequestToken) ?? generateParticipantAccessToken();
    cookieStore.set(cookieName, joinRequestToken, getParticipantCookieOptions(expiresAt, process.env.NODE_ENV === "production"));

    return { status: "ready" };
  } catch {
    console.error("Failed to prepare a participant join request.");

    return { status: "error", message: t("error.prepare") };
  }
}

export async function joinRoomAction(_previousState: JoinRoomActionState, formData: FormData): Promise<JoinRoomActionState> {
  const t = await getTranslations("JoinRoom");
  const parsedInput = joinRoomInputSchema.safeParse({
    roomCode: formData.get("roomCode"),
    name: formData.get("name"),
  });

  if (!parsedInput.success) {
    const hasInvalidRoomCode = parsedInput.error.issues.some(issue => issue.path[0] === "roomCode");

    return hasInvalidRoomCode
      ? { status: "unavailable" }
      : {
          status: "validation_error",
          message: t("error.nameValidation"),
        };
  }

  const cookieStore = await cookies();
  const cookieName = getParticipantCookieName(parsedInput.data.roomCode);
  const joinRequestCookieName = getParticipantJoinRequestCookieName(parsedInput.data.roomCode);
  const storedAccessToken = cookieStore.get(cookieName)?.value ?? null;
  const joinRequestToken = parseParticipantAccessToken(cookieStore.get(joinRequestCookieName)?.value);

  if (!joinRequestToken) {
    return { status: "error", message: t("error.prepare") };
  }

  try {
    const result = await joinRoomParticipant(
      {
        ...parsedInput.data,
        joinRequestToken,
      },
      storedAccessToken,
    );

    if (result.status === "joined" && result.newSession) {
      cookieStore.set(
        cookieName,
        result.newSession.rawAccessToken,
        getParticipantCookieOptions(result.newSession.expiresAt, process.env.NODE_ENV === "production"),
      );
    }

    cookieStore.set(joinRequestCookieName, "", getExpiredParticipantCookieOptions(process.env.NODE_ENV === "production"));

    return toJoinRoomActionState(result);
  } catch {
    console.error("Failed to join a room.");

    return {
      status: "error",
      message: t("error.join"),
    };
  }
}
