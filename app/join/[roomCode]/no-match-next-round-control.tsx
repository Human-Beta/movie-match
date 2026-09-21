"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { confirmNoMatchNextRoundAction } from "@/app/join/[roomCode]/next-round-actions";
import { getNextRoundControlPresentation, type LocalNextRoundOutcome } from "@/app/join/[roomCode]/next-round-control-presentation";
import { NextRoundRequestStorage } from "@/app/join/[roomCode]/next-round-request-storage";
import { PrimaryButton } from "@/app/ui/primary-button";
import type { ParticipantNoMatchReadiness, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

export function NoMatchNextRoundControl({
  roomCode,
  round,
  readiness,
  isNextRoundGenerating,
}: Readonly<{ roomCode: string; round: PublicRoomRound; readiness: ParticipantNoMatchReadiness; isNextRoundGenerating: boolean }>): ReactNode {
  const t = useTranslations("NoMatchNextRound");
  const [feedback, setFeedback] = useState<"idle" | "retry" | "storage">("idle");
  const [localOutcome, setLocalOutcome] = useState<Readonly<{ roundId: string; outcome: LocalNextRoundOutcome }> | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const presentation = getNextRoundControlPresentation({
    ownReady: readiness.ownReady,
    roundId: round.roundId,
    localOutcome,
    pending: pending || isNextRoundGenerating,
  });

  if (presentation === "waiting") {
    return <p className="mt-5 rounded-2xl bg-slate-950/60 p-4 text-slate-300 ring-1 ring-white/10">{t("waiting")}</p>;
  }

  function confirm(): void {
    if (submitting.current) {
      return;
    }
    submitting.current = true;
    startTransition(async () => {
      let nextRequestId: string;
      let storage: NextRoundRequestStorage;

      try {
        storage = new NextRoundRequestStorage(window.localStorage, roomCode, round.roundId);
        nextRequestId = storage.read()?.requestId ?? crypto.randomUUID();
        storage.persist({ requestId: nextRequestId });
      } catch {
        setFeedback("storage");
        submitting.current = false;
        return;
      }

      try {
        const result = await confirmNoMatchNextRoundAction({ roomCode, roundId: round.roundId, requestId: nextRequestId });

        if (result.status === "error") {
          setFeedback("retry");
          return;
        }
        if (result.status === "ready" || result.status === "started" || result.status === "list_exhausted") {
          storage.clear(nextRequestId);
          setLocalOutcome({ roundId: round.roundId, outcome: result.status });
          return;
        }
        setFeedback("retry");
      } catch {
        setFeedback("retry");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div className="mt-5">
      <PrimaryButton className="w-full" disabled={presentation === "creating" || feedback === "storage"} onClick={confirm}>
        {presentation === "creating" ? t("creating") : t("next")}
      </PrimaryButton>
      {feedback === "retry" ? <p className="mt-3 text-sm text-amber-200">{t("retry")}</p> : null}
      {feedback === "storage" ? <p className="mt-3 text-sm text-rose-200">{t("storage")}</p> : null}
    </div>
  );
}
