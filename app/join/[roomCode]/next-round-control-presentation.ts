export type LocalNextRoundOutcome = "ready" | "started" | "list_exhausted";

export type NextRoundControlPresentation = "confirm" | "waiting" | "creating";

export function getNextRoundControlPresentation({
  ownReady,
  roundId,
  localOutcome,
  pending,
}: Readonly<{
  ownReady: boolean;
  roundId: string;
  localOutcome: Readonly<{ roundId: string; outcome: LocalNextRoundOutcome }> | null;
  pending: boolean;
}>): NextRoundControlPresentation {
  if (ownReady || (localOutcome?.roundId === roundId && localOutcome.outcome === "ready")) {
    return "waiting";
  }

  if (pending || (localOutcome?.roundId === roundId && localOutcome.outcome !== "ready")) {
    return "creating";
  }

  return "confirm";
}
