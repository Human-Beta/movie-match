export const NO_MATCH_NEXT_ROUND_OUTCOME = {
  READY: "ready",
  STARTED: "started",
  LIST_EXHAUSTED: "list_exhausted",
} as const;

export const NO_MATCH_NEXT_ROUND_OUTCOME_VALUES = [
  NO_MATCH_NEXT_ROUND_OUTCOME.READY,
  NO_MATCH_NEXT_ROUND_OUTCOME.STARTED,
  NO_MATCH_NEXT_ROUND_OUTCOME.LIST_EXHAUSTED,
] as const;

export type NoMatchNextRoundOutcome = (typeof NO_MATCH_NEXT_ROUND_OUTCOME_VALUES)[number];
