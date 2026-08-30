"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { openTvRoom, type OpenTvRoomResult } from "@/app/tv/actions";
import { TV_ROOM_CREATION_REQUEST_STORAGE_KEY, TV_ROOM_STORAGE_KEY } from "@/app/tv/storage";

function getOrCreateCreationRequestId(): string {
  const storedRequestId = window.localStorage.getItem(TV_ROOM_CREATION_REQUEST_STORAGE_KEY);

  if (storedRequestId) {
    return storedRequestId;
  }

  const creationRequestId = window.crypto.randomUUID();
  window.localStorage.setItem(TV_ROOM_CREATION_REQUEST_STORAGE_KEY, creationRequestId);

  return creationRequestId;
}

export default function TvPage(): ReactNode {
  const t = useTranslations("TvPage");
  const router = useRouter();
  const startedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    startTransition(async () => {
      let savedRoomCode: string | null;
      let creationRequestId: string;

      try {
        savedRoomCode = window.localStorage.getItem(TV_ROOM_STORAGE_KEY);
        creationRequestId = getOrCreateCreationRequestId();
      } catch {
        setErrorMessage(t("storageUnavailable"));
        return;
      }

      let result: OpenTvRoomResult;

      try {
        result = await openTvRoom({ savedRoomCode, creationRequestId });
      } catch {
        setErrorMessage(t("transportError"));
        return;
      }

      if (result.status === "error") {
        if (result.resetCreationRequest) {
          window.localStorage.removeItem(TV_ROOM_CREATION_REQUEST_STORAGE_KEY);
        }

        setErrorMessage(result.message);
        return;
      }

      try {
        window.localStorage.setItem(TV_ROOM_STORAGE_KEY, result.roomCode);
        window.localStorage.removeItem(TV_ROOM_CREATION_REQUEST_STORAGE_KEY);
      } catch {
        setErrorMessage(t("saveFailure"));
        return;
      }

      router.replace(`/tv/${result.roomCode}`);
    });
  }, [router, startTransition, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-xl text-center" aria-live="polite">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        {errorMessage ? (
          <>
            <h1 className="text-3xl font-bold">{t("openFailureTitle")}</h1>
            <p className="mt-4 text-lg text-slate-300">{errorMessage}</p>
            <button
              className="mt-8 rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-300"
              type="button"
              onClick={() => window.location.reload()}
            >
              {t("retry")}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold">{t("preparingTitle")}</h1>
            <p className="mt-4 text-lg text-slate-300">{isPending ? t("checkingSaved") : t("starting")}</p>
          </>
        )}
      </section>
    </main>
  );
}
