import { z } from "zod";

import type { GameCommand } from "@/lib/game-rounds/game-command";

const pendingGameCommandSchema = z.strictObject({
  requestId: z.uuid(),
});

export type PendingGameCommand = z.infer<typeof pendingGameCommandSchema>;

export class GameCommandRequestStorage {
  private readonly key: string;

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    roomCode: string,
    command: GameCommand,
  ) {
    this.key = `movie-match.game-command.${command}.${roomCode}`;
  }

  read(): PendingGameCommand | null {
    const stored = this.storage.getItem(this.key);

    if (stored === null) {
      return null;
    }

    return pendingGameCommandSchema.parse(JSON.parse(stored));
  }

  persist(request: PendingGameCommand): void {
    this.storage.setItem(this.key, JSON.stringify(pendingGameCommandSchema.parse(request)));
  }

  clear(requestId: string): void {
    const pending = this.read();

    if (pending?.requestId === requestId) {
      this.storage.removeItem(this.key);
    }
  }
}
