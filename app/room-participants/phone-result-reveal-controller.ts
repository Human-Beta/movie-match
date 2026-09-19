import { createTerminalRoundPresentationKey, type TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import type { TimerId, TimerScheduler } from "@/app/room-participants/timer-scheduler";
import type { ResultRevealReadyHint } from "@/lib/realtime/result-reveal-hint";

export const PHONE_RESULT_REVEAL_FALLBACK_MS = 2_500;

export type PhoneResultRevealControllerOptions = {
  fallbackMs?: number;
  onReveal(presentationKey: string): void;
  scheduler: TimerScheduler;
};

export class PhoneResultRevealController {
  private currentPresentationKey: string | null = null;
  private readonly fallbackMs: number;
  private fallbackTimer: TimerId | null = null;
  private revealedPresentationKey: string | null = null;

  constructor(private readonly options: PhoneResultRevealControllerOptions) {
    this.fallbackMs = options.fallbackMs ?? PHONE_RESULT_REVEAL_FALLBACK_MS;
  }

  updatePresentation(presentation: TerminalRoundPresentation | null, directTerminalLoad: boolean): void {
    const nextPresentationKey = presentation?.key ?? null;

    if (nextPresentationKey === this.currentPresentationKey) {
      return;
    }

    this.clearFallbackTimer();
    this.currentPresentationKey = nextPresentationKey;

    if (nextPresentationKey === null) {
      return;
    }

    if (directTerminalLoad) {
      this.reveal(nextPresentationKey);
      return;
    }

    this.fallbackTimer = this.options.scheduler.setTimeout((): void => {
      this.fallbackTimer = null;
      this.reveal(nextPresentationKey);
    }, this.fallbackMs);
  }

  receiveHint(hint: ResultRevealReadyHint): void {
    const hintedPresentationKey = createTerminalRoundPresentationKey(hint.roundId, hint.status);

    if (hintedPresentationKey !== this.currentPresentationKey) {
      return;
    }

    this.reveal(hintedPresentationKey);
  }

  stop(): void {
    this.clearFallbackTimer();
    this.currentPresentationKey = null;
  }

  private reveal(presentationKey: string): void {
    if (presentationKey !== this.currentPresentationKey || this.revealedPresentationKey === presentationKey) {
      return;
    }

    this.revealedPresentationKey = presentationKey;
    this.clearFallbackTimer();
    this.options.onReveal(presentationKey);
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer !== null) {
      this.options.scheduler.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}
