import { z } from "zod";

import { GAME_COMMAND, type GameCommand } from "@/lib/game-rounds/game-command";

const postMatchCommandSchema = z.union([z.literal(GAME_COMMAND.SEARCH_AGAIN), z.literal(GAME_COMMAND.CLOSE)]);
const pendingPostMatchCommandSchema = z.strictObject({
  command: postMatchCommandSchema,
  requestId: z.uuid(),
});

export type PostMatchCommand = Extract<GameCommand, "search_again" | "close">;
export type PendingPostMatchCommand = z.infer<typeof pendingPostMatchCommandSchema>;

export class PostMatchCommandRequestStorage {
  private readonly key: string;

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    roomCode: string,
  ) {
    this.key = `movie-match.post-match-command.${roomCode}`;
  }

  read(): PendingPostMatchCommand | null {
    const stored = this.storage.getItem(this.key);

    if (stored === null) {
      return null;
    }

    return pendingPostMatchCommandSchema.parse(JSON.parse(stored));
  }

  persist(request: PendingPostMatchCommand): void {
    this.storage.setItem(this.key, JSON.stringify(pendingPostMatchCommandSchema.parse(request)));
  }

  clear(requestId: string): void {
    if (this.read()?.requestId === requestId) {
      this.storage.removeItem(this.key);
    }
  }
}
