import "server-only";

import { DrizzleGameRoundRepository } from "@/lib/game-rounds/game-round-repository";
import type { GameCommandInput } from "@/lib/game-rounds/game-command-input";
import { GameRoundService, type GameCommandResult } from "@/lib/game-rounds/game-round-service";

const service = new GameRoundService(new DrizzleGameRoundRepository());

export function startGame(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
  return service.start(input, storedAccessToken);
}

export function restartMovieList(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
  return service.restart(input, storedAccessToken);
}

export function searchAgain(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
  return service.searchAgain(input, storedAccessToken);
}

export function closeMatchedRoom(input: GameCommandInput, storedAccessToken: string | null): Promise<GameCommandResult> {
  return service.close(input, storedAccessToken);
}
