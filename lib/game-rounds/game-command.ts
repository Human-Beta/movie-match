export const GAME_COMMAND = {
  START: "start",
  RESTART: "restart",
  SEARCH_AGAIN: "search_again",
  CLOSE: "close",
} as const;

export const GAME_COMMAND_VALUES = [GAME_COMMAND.START, GAME_COMMAND.RESTART, GAME_COMMAND.SEARCH_AGAIN, GAME_COMMAND.CLOSE] as const;

export type GameCommand = (typeof GAME_COMMAND_VALUES)[number];

export const GAME_COMMAND_OUTCOME = {
  STARTED: "started",
  CATALOG_INSUFFICIENT: "catalog_insufficient",
  LIST_EXHAUSTED: "list_exhausted",
  CLOSED: "closed",
} as const;

export const GAME_COMMAND_OUTCOME_VALUES = [
  GAME_COMMAND_OUTCOME.STARTED,
  GAME_COMMAND_OUTCOME.CATALOG_INSUFFICIENT,
  GAME_COMMAND_OUTCOME.LIST_EXHAUSTED,
  GAME_COMMAND_OUTCOME.CLOSED,
] as const;

export type GameCommandOutcome = (typeof GAME_COMMAND_OUTCOME_VALUES)[number];
