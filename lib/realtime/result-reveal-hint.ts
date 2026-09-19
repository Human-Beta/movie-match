import { ROUND_STATUS, type TerminalRoundStatus } from "@/lib/game-rounds/round-status";

export type ResultRevealReadyHint = {
  roundId: string;
  status: TerminalRoundStatus;
};

export function isResultRevealReadyHint(value: unknown): value is ResultRevealReadyHint {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ResultRevealReadyHint>;

  return typeof candidate.roundId === "string" && (candidate.status === ROUND_STATUS.MATCHED || candidate.status === ROUND_STATUS.NO_MATCH);
}
