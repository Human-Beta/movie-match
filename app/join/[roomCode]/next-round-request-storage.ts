import { z } from "zod";

const pendingNextRoundRequestSchema = z.strictObject({
  requestId: z.uuid(),
});

export type PendingNextRoundRequest = z.infer<typeof pendingNextRoundRequestSchema>;

export class NextRoundRequestStorage {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    roomCode: string,
    roundId: string,
  ) {
    this.key = `movie-match:next-round:${roomCode}:${roundId}`;
  }

  private readonly key: string;

  read(): PendingNextRoundRequest | null {
    const raw = this.storage.getItem(this.key);

    if (raw === null) {
      return null;
    }

    return pendingNextRoundRequestSchema.parse(JSON.parse(raw));
  }

  persist(request: PendingNextRoundRequest): void {
    this.storage.setItem(this.key, JSON.stringify(pendingNextRoundRequestSchema.parse(request)));
  }

  clear(requestId: string): void {
    if (this.read()?.requestId === requestId) {
      this.storage.removeItem(this.key);
    }
  }
}
