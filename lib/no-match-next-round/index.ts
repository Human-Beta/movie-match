import "server-only";

import { DrizzleNoMatchNextRoundRepository } from "@/lib/no-match-next-round/next-round-repository";
import { NoMatchNextRoundService, type NoMatchNextRoundResult } from "@/lib/no-match-next-round/next-round-service";
import type { NextRoundInput } from "@/lib/no-match-next-round/next-round-input";

const service = new NoMatchNextRoundService(new DrizzleNoMatchNextRoundRepository());

export function confirmNoMatchNextRound(input: NextRoundInput, storedAccessToken: string | null): Promise<NoMatchNextRoundResult> {
  return service.confirm(input, storedAccessToken);
}
