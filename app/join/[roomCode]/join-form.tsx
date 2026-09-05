"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";

import { joinRoomAction, prepareJoinRoomAction } from "@/app/join/[roomCode]/actions";
import type { PrepareJoinRoomResult } from "@/app/join/[roomCode]/actions";
import type { JoinRoomActionState } from "@/app/join/[roomCode]/join-action-state";
import { FullRoomState, JoinedRoomState, UnavailableRoomState } from "@/app/join/[roomCode]/room-states";
import { assertNever } from "@/lib/assert-never";

function getErrorMessage(state: JoinRoomActionState, preparationError: string | null): string | null {
  if (preparationError !== null) {
    return preparationError;
  }

  if (state.status === "validation_error" || state.status === "error") {
    return state.message;
  }

  return null;
}

function getSubmitLabelKey(isPreparing: boolean, isJoining: boolean): "form.preparing" | "form.joining" | "form.join" {
  if (isPreparing) {
    return "form.preparing";
  }

  if (isJoining) {
    return "form.joining";
  }

  return "form.join";
}

export function JoinRoomForm({ roomCode }: Readonly<{ roomCode: string }>): ReactNode {
  const t = useTranslations("JoinRoom");
  const preparationFallbackMessage = t("error.prepare");
  const [state, formAction, isJoining] = useActionState(joinRoomAction, { status: "form" });
  const [isPrepared, setIsPrepared] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [isPreparing, startPreparing] = useTransition();

  useEffect(() => {
    let isCurrent = true;

    startPreparing(async () => {
      let result: PrepareJoinRoomResult;

      try {
        result = await prepareJoinRoomAction(roomCode);
      } catch {
        result = { status: "error", message: preparationFallbackMessage };
      }

      if (!isCurrent) {
        return;
      }

      if (result.status === "error") {
        setPreparationError(result.message);
        return;
      }

      setIsPrepared(true);
    });

    return (): void => {
      isCurrent = false;
    };
  }, [preparationFallbackMessage, roomCode]);

  switch (state.status) {
    case "joined":
      return <JoinedRoomState participant={state.participant} room={state.room} />;
    case "full":
      return <FullRoomState />;
    case "unavailable":
      return <UnavailableRoomState />;
    case "form":
    case "validation_error":
    case "error":
      break;
    default:
      return assertNever(state);
  }

  const isPending = isPreparing || isJoining;
  const errorMessage = getErrorMessage(state, preparationError);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-50">
      <section className="w-full max-w-lg rounded-3xl bg-slate-900 p-7 shadow-2xl ring-1 shadow-black/20 ring-white/10 sm:p-10">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("form.title")}</h1>
        <p className="mt-3 text-slate-300">
          {t("form.roomCodeLabel")} <span className="font-mono font-bold text-white">{roomCode}</span>
        </p>

        <form action={formAction} className="mt-8 space-y-5" aria-busy={isPending}>
          <input name="roomCode" type="hidden" value={roomCode} />
          <div>
            <label className="block text-sm font-semibold text-slate-200" htmlFor="name">
              {t("form.nameLabel")}
            </label>
            <input
              autoComplete="name"
              autoFocus
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-lg text-white transition outline-none placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 disabled:opacity-60"
              disabled={isPending || !isPrepared}
              id="name"
              name="name"
              placeholder={t("form.namePlaceholder")}
              required
              type="text"
            />
          </div>

          {errorMessage !== null ? (
            <p className="rounded-2xl bg-rose-950/60 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="w-full rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
            disabled={isPending || !isPrepared}
            type="submit"
          >
            {t(getSubmitLabelKey(isPreparing, isJoining))}
          </button>
        </form>
      </section>
    </main>
  );
}
