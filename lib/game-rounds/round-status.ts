import { assertNever } from "@/lib/assert-never";

export const ROUND_STATUS = {
  VOTING: "voting",
  MATCHED: "matched",
  NO_MATCH: "no_match",
} as const;

export const ROUND_STATUS_VALUES = [ROUND_STATUS.VOTING, ROUND_STATUS.MATCHED, ROUND_STATUS.NO_MATCH] as const;

export type RoundStatus = (typeof ROUND_STATUS_VALUES)[number];
export type MatchedRoundStatus = typeof ROUND_STATUS.MATCHED;
export type NoMatchRoundStatus = typeof ROUND_STATUS.NO_MATCH;
export type TerminalRoundStatus = MatchedRoundStatus | NoMatchRoundStatus;

export function isTerminalRoundStatus(status: RoundStatus): status is TerminalRoundStatus {
  switch (status) {
    case ROUND_STATUS.MATCHED:
    case ROUND_STATUS.NO_MATCH:
      return true;
    case ROUND_STATUS.VOTING:
      return false;
    default:
      return assertNever(status);
  }
}
