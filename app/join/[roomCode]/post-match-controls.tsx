"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { closeMatchedRoomAction, searchAgainAction, type PublicGameCommandResult } from "@/app/join/[roomCode]/game-actions";
import {
  PostMatchCommandRequestStorage,
  type PendingPostMatchCommand,
  type PostMatchCommand,
} from "@/app/join/[roomCode]/post-match-command-request-storage";
import { PrimaryButton } from "@/app/ui/primary-button";
import { assertNever } from "@/lib/assert-never";

type PostMatchFeedback = "idle" | "retry" | "storage" | "unavailable" | "conflict" | "validation_error";

export function PostMatchControls({ roomCode }: Readonly<{ roomCode: string }>): ReactNode {
  const router = useRouter();
  const t = useTranslations("PostMatchActions");
  const [pendingRequest, setPendingRequest] = useState<PendingPostMatchCommand | null>(null);
  const [feedback, setFeedback] = useState<PostMatchFeedback>("idle");
  const [storageReady, setStorageReady] = useState(false);
  const [commandPending, startCommand] = useTransition();
  const submitting = useRef(false);

  useEffect(() => {
    let current = true;

    try {
      const pending = new PostMatchCommandRequestStorage(window.sessionStorage, roomCode).read();
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

  function submit(command: PostMatchCommand): void {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    startCommand(async () => {
      const storage = new PostMatchCommandRequestStorage(window.sessionStorage, roomCode);
      let request: PendingPostMatchCommand;

      try {
        request = pendingRequest ?? { command, requestId: crypto.randomUUID() };

        if (request.command !== command) {
          setFeedback("retry");
          return;
        }

        storage.persist(request);
        setPendingRequest(request);
      } catch {
        setFeedback("storage");
        return;
      }

      try {
        const result = await (command === "search_again"
          ? searchAgainAction({ roomCode, requestId: request.requestId })
          : closeMatchedRoomAction({ roomCode, requestId: request.requestId }));

        if (result.status === "error") {
          setFeedback("retry");
          return;
        }

        storage.clear(request.requestId);
        setPendingRequest(null);

        if (applyTerminalResult(result, setFeedback)) {
          router.refresh();
        }
      } catch {
        setFeedback("retry");
      } finally {
        submitting.current = false;
      }
    });
  }

  const disabled = !storageReady || commandPending || feedback === "storage";

  function isActionDisabled(command: PostMatchCommand): boolean {
    return disabled || (pendingRequest !== null && pendingRequest.command !== command);
  }

  return (
    <section aria-label={t("label")} className="mt-6" aria-live="polite">
      {feedback === "idle" ? null : (
        <p className="mb-4 rounded-2xl bg-rose-950/60 p-4 text-sm leading-6 text-rose-200 ring-1 ring-rose-400/20" role="alert">
          {t(`feedback.${feedback}`)}
        </p>
      )}
      {commandPending ? <p className="mb-4 text-sm text-slate-300">{t("pending")}</p> : null}
      <div className="grid gap-3">
        <PrimaryButton busy={commandPending} className="w-full" disabled={isActionDisabled("search_again")} onClick={() => submit("search_again")}>
          {pendingRequest?.command === "search_again" ? t("retrySearchAgain") : t("searchAgain")}
        </PrimaryButton>
        <PrimaryButton
          busy={commandPending}
          className="w-full bg-rose-400 hover:bg-rose-300"
          disabled={isActionDisabled("close")}
          onClick={() => submit("close")}
        >
          {pendingRequest?.command === "close" ? t("retryClose") : t("close")}
        </PrimaryButton>
      </div>
    </section>
  );
}

function applyTerminalResult(
  result: Exclude<PublicGameCommandResult, { status: "error" }>,
  setFeedback: (feedback: PostMatchFeedback) => void,
): boolean {
  switch (result.status) {
    case "started":
    case "list_exhausted":
    case "closed":
      setFeedback("idle");
      return true;
    case "catalog_insufficient":
    case "unavailable":
    case "conflict":
    case "validation_error":
      setFeedback(result.status === "catalog_insufficient" ? "unavailable" : result.status);
      return false;
    default:
      return assertNever(result);
  }
}
