import { z } from "zod";

import { ballotVoteSchema, type BallotVoteInput } from "@/lib/ballots/ballot-vote";

const pendingBallotSchema = z.strictObject({
  requestId: z.uuid(),
  votes: z.array(ballotVoteSchema).length(3),
});

export type PendingBallot = {
  requestId: string;
  votes: BallotVoteInput[];
};

export class BallotRequestStorage {
  private readonly key: string;

  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
    roomCode: string,
    roundId: string,
  ) {
    this.key = `movie-match.ballot.${roomCode}.${roundId}`;
  }

  read(): PendingBallot | null {
    const stored = this.storage.getItem(this.key);

    if (stored === null) {
      return null;
    }

    return pendingBallotSchema.parse(JSON.parse(stored));
  }

  persist(ballot: PendingBallot): void {
    this.storage.setItem(this.key, JSON.stringify(pendingBallotSchema.parse(ballot)));
  }

  clear(requestId: string): void {
    const pending = this.read();

    if (pending?.requestId === requestId) {
      this.storage.removeItem(this.key);
    }
  }
}
