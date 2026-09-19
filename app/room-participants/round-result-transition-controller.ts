import type { TimerId, TimerScheduler } from "@/app/room-participants/timer-scheduler";
import type { TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import { assertNever } from "@/lib/assert-never";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";

export const MATCH_SELECTED_EMPHASIS_MS = 400;
export const MATCH_RESULT_EXPANSION_MS = 800;
export const NO_MATCH_REACTION_MS = 700;

export type RoundResultTransitionStage = "match_emphasis" | "match_expanding" | "no_match_reaction" | "stable";

export type RoundResultTransitionControllerOptions = {
  onComplete(presentation: TerminalRoundPresentation): void;
  onStageChange(stage: RoundResultTransitionStage): void;
  presentation: TerminalRoundPresentation;
  reducedMotion: boolean;
  scheduler: TimerScheduler;
};

export function getInitialRoundResultTransitionStage(presentation: TerminalRoundPresentation, reducedMotion: boolean): RoundResultTransitionStage {
  if (reducedMotion) {
    return "stable";
  }

  return presentation.status === ROUND_STATUS.MATCHED ? "match_emphasis" : "no_match_reaction";
}

export class RoundResultTransitionController {
  private completed = false;
  private timer: TimerId | null = null;

  constructor(private readonly options: RoundResultTransitionControllerOptions) {}

  start(): void {
    if (this.options.reducedMotion) {
      this.options.onStageChange("stable");
      this.complete();
      return;
    }

    switch (this.options.presentation.status) {
      case ROUND_STATUS.MATCHED:
        this.options.onStageChange("match_emphasis");
        this.schedule(MATCH_SELECTED_EMPHASIS_MS, (): void => {
          this.options.onStageChange("match_expanding");
          this.schedule(MATCH_RESULT_EXPANSION_MS, (): void => {
            this.options.onStageChange("stable");
            this.complete();
          });
        });
        return;
      case ROUND_STATUS.NO_MATCH:
        this.options.onStageChange("no_match_reaction");
        this.schedule(NO_MATCH_REACTION_MS, (): void => {
          this.options.onStageChange("stable");
          this.complete();
        });
        return;
      default:
        return assertNever(this.options.presentation.status);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      this.options.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private complete(): void {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.options.onComplete(this.options.presentation);
  }

  private schedule(milliseconds: number, callback: () => void): void {
    this.timer = this.options.scheduler.setTimeout((): void => {
      this.timer = null;
      callback();
    }, milliseconds);
  }
}
