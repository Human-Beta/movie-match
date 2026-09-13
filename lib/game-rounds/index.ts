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
