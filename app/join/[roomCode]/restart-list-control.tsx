"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { restartMovieListAction } from "@/app/join/[roomCode]/game-actions";
import { GameCommandRequestStorage, type PendingGameCommand } from "@/app/join/[roomCode]/game-command-request-storage";
import { PrimaryButton } from "@/app/ui/primary-button";
import { assertNever } from "@/lib/assert-never";

type RestartFeedback = "idle" | "retry" | "storage" | "unavailable" | "conflict" | "validation_error";

export function RestartListControl({ roomCode }: Readonly<{ roomCode: string }>): ReactNode {
  const t = useTranslations("GameRound");
  const [pendingRequest, setPendingRequest] = useState<PendingGameCommand | null>(null);
  const [feedback, setFeedback] = useState<RestartFeedback>("idle");
  const [storageReady, setStorageReady] = useState(false);
  const [restarting, startRestarting] = useTransition();
  const submitting = useRef(false);

  useEffect(() => {
    let current = true;

    try {
      const pending = new GameCommandRequestStorage(window.sessionStorage, roomCode, "restart").read();
      queueMicrotask(() => {
        if (current) {
          setPendingRequest(pending);
          setFeedback(pending === null ? "idle" : "retry");
          setStorageReady(true);
        }
      });
    } catch {
      queueMicrotask(() => {
        if (current) {
          setFeedback("storage");
        }
      });
    }

    return (): void => {
      current = false;
    };
  }, [roomCode]);

  function restart(): void {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    startRestarting(async () => {
      const storage = new GameCommandRequestStorage(window.sessionStorage, roomCode, "restart");
      let request: PendingGameCommand;

      try {
        request = pendingRequest ?? { requestId: crypto.randomUUID() };
        storage.persist(request);
        setPendingRequest(request);
      } catch {
        setFeedback("storage");
        submitting.current = false;
        return;
      }

      try {
        const result = await restartMovieListAction({ roomCode, requestId: request.requestId });

        if (result.status === "error") {
          setFeedback("retry");
          return;
        }

        storage.clear(request.requestId);
        setPendingRequest(null);

        switch (result.status) {
          case "started":
            setFeedback("idle");
            return;
          case "catalog_insufficient":
          case "list_exhausted":
            setFeedback("unavailable");
            return;
          case "unavailable":
          case "conflict":
          case "validation_error":
            setFeedback(result.status);
            return;
          default:
            return assertNever(result);
        }
      } catch {
        setFeedback("retry");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div className="mt-6">
      {feedback === "idle" ? null : (
        <p className="mb-4 rounded-2xl bg-rose-950/60 p-4 text-sm leading-6 text-rose-200 ring-1 ring-rose-400/20" role="alert">
          {t(`restartFeedback.${feedback}`)}
        </p>
      )}
      <PrimaryButton busy={restarting} className="w-full" disabled={!storageReady || restarting || feedback === "storage"} onClick={restart}>
        {restarting ? t("restarting") : pendingRequest === null ? t("restart") : t("retryRestart")}
      </PrimaryButton>
    </div>
  );
}
