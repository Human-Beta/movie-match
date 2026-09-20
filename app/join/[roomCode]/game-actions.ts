"use server";

import "server-only";

import { cookies } from "next/headers";

import { gameCommandInputSchema, type GameCommandInput } from "@/lib/game-rounds/game-command-input";
import { closeMatchedRoom, restartMovieList, searchAgain, startGame } from "@/lib/game-rounds";
import type { GameCommandResult } from "@/lib/game-rounds/game-round-service";
import { getParticipantCookieName } from "@/lib/participants/participant-cookie";
import { notifyRoomChanged } from "@/lib/realtime/participant-broadcast-server";

export type PublicGameCommandResult =
  | { status: "started" }
  | { status: "catalog_insufficient" }
  | { status: "list_exhausted" }
  | { status: "closed" }
  | { status: "unavailable" }
  | { status: "validation_error" }
  | { status: "conflict" }
  | { status: "error" };

export async function startGameAction(input: GameCommandInput): Promise<PublicGameCommandResult> {
  return runGameCommand(input, startGame);
}

export async function restartMovieListAction(input: GameCommandInput): Promise<PublicGameCommandResult> {
  return runGameCommand(input, restartMovieList);
}

export async function searchAgainAction(input: GameCommandInput): Promise<PublicGameCommandResult> {
  return runGameCommand(input, searchAgain);
}

export async function closeMatchedRoomAction(input: GameCommandInput): Promise<PublicGameCommandResult> {
  return runGameCommand(input, closeMatchedRoom);
}

async function runGameCommand(
  input: GameCommandInput,
  command: (input: GameCommandInput, storedAccessToken: string | null) => Promise<GameCommandResult>,
): Promise<PublicGameCommandResult> {
  const parsed = gameCommandInputSchema.safeParse(input);

  if (!parsed.success) {
    return { status: "validation_error" };
  }

  try {
    const cookieStore = await cookies();
    const storedAccessToken = cookieStore.get(getParticipantCookieName(parsed.data.roomCode))?.value ?? null;
    const result = await command(parsed.data, storedAccessToken);

    if (result.status !== "completed") {
      return result;
    }

    if (result.outcome !== "catalog_insufficient") {
      try {
        await notifyRoomChanged(result.roomId);
      } catch {
        // Authoritative waiting/active-state refreshes recover from failed invalidation.
      }
    }

    return { status: result.outcome };
  } catch {
    console.error("Failed to run a game command.");
    return { status: "error" };
  }
}
