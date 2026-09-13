"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { readRoomFiltersAction, saveRoomFiltersAction } from "@/app/join/[roomCode]/filter-actions";
import { FilterRequestStorage } from "@/app/join/[roomCode]/filter-request-storage";
import { startGameAction, type PublicGameCommandResult } from "@/app/join/[roomCode]/game-actions";
import { GameCommandRequestStorage, type PendingGameCommand } from "@/app/join/[roomCode]/game-command-request-storage";
import { PrimaryButton } from "@/app/ui/primary-button";
import { assertNever } from "@/lib/assert-never";
import {
  yearFilterSchema,
  type PendingFilterSave,
  type RoomFilterSnapshot,
  type RoomFilterValues,
  type SaveRoomFiltersResult,
} from "@/lib/room-filters/room-filter-values";

type FilterLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "storage_error" }
  | { status: "unavailable" }
  | {
      status: "ready";
      snapshot: RoomFilterSnapshot;
      pendingFilterRequest: PendingFilterSave | null;
      pendingGameRequest: PendingGameCommand | null;
    };
type Feedback = "idle" | "saved" | "retry" | "storage" | "validation_error" | "conflict";
type VisibleFeedback = Exclude<Feedback, "idle">;
type GameFeedback = "idle" | "retry" | "storage" | "started" | "exhausted" | "unavailable" | "validation_error" | "conflict";
type VisibleGameFeedback = Exclude<GameFeedback, "idle">;

export function HostFilters({ participantCount, roomCode }: Readonly<{ participantCount: number; roomCode: string }>): ReactNode {
  const t = useTranslations("HostFilters");
  const [state, setState] = useState<FilterLoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readRoomFiltersAction(roomCode).then(
      result => {
        if (!current) {
          return;
        }
        switch (result.status) {
          case "ready":
            try {
              const pendingFilterRequest = new FilterRequestStorage(window.sessionStorage, roomCode).read();
              const pendingGameRequest = new GameCommandRequestStorage(window.sessionStorage, roomCode, "start").read();
              setState({ ...result, pendingFilterRequest, pendingGameRequest });
            } catch {
              setState({ status: "storage_error" });
            }
            break;
          case "error":
          case "unavailable":
            setState(result);
            break;
          default:
            assertNever(result);
        }
      },
      () => {
        if (current) {
          setState({ status: "error" });
        }
      },
    );
    return (): void => {
      current = false;
    };
  }, [roomCode, attempt]);

  switch (state.status) {
    case "loading":
      return (
        <p className="mt-6 text-slate-300" role="status">
          {t("loading")}
        </p>
      );
    case "unavailable":
      return (
        <p className="mt-6 text-slate-300" role="alert">
          {t("unavailable")}
        </p>
      );
    case "storage_error":
    case "error":
      return (
        <div className="mt-6">
          <p role="alert">{t(state.status === "storage_error" ? "storage" : "loadError")}</p>
          <button
            className="mt-3 text-amber-400 underline"
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt(value => value + 1);
            }}
          >
            {t("retry")}
          </button>
        </div>
      );
    case "ready":
      return (
        <HostFilterForm
          key={roomCode}
          roomCode={roomCode}
          participantCount={participantCount}
          initialSnapshot={state.snapshot}
          initialPendingFilterRequest={state.pendingFilterRequest}
          initialPendingGameRequest={state.pendingGameRequest}
        />
      );
    default:
      return assertNever(state);
  }
}

function HostFilterForm({
  roomCode,
  participantCount,
  initialSnapshot,
  initialPendingFilterRequest,
  initialPendingGameRequest,
}: Readonly<{
  roomCode: string;
  participantCount: number;
  initialSnapshot: RoomFilterSnapshot;
  initialPendingFilterRequest: PendingFilterSave | null;
  initialPendingGameRequest: PendingGameCommand | null;
}>): ReactNode {
  const t = useTranslations("HostFilters");
  const [filters, setFilters] = useState(initialPendingFilterRequest?.filters ?? initialSnapshot.filters);
  const [savedFilters, setSavedFilters] = useState(initialSnapshot.filters);
  const [pendingFilterRequest, setPendingFilterRequest] = useState<PendingFilterSave | null>(initialPendingFilterRequest);
  const [pendingGameRequest, setPendingGameRequest] = useState<PendingGameCommand | null>(initialPendingGameRequest);
  const [unavailable, setUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(initialPendingFilterRequest ? "retry" : "idle");
  const [gameFeedback, setGameFeedback] = useState<GameFeedback>(initialPendingGameRequest ? "retry" : "idle");
  const [saving, startSaving] = useTransition();
  const [starting, startStarting] = useTransition();
  const savingRef = useRef(false);
  const startingRef = useRef(false);
  const hasUnsavedChanges = !equalFilters(filters, savedFilters);

  function updateFilters(next: RoomFilterValues): void {
    setFilters(next);
    setFeedback("idle");
  }

  function prepareRequest(storage: FilterRequestStorage): PendingFilterSave | null {
    try {
      const request = pendingFilterRequest ?? { requestId: crypto.randomUUID(), filters };
      storage.persist(request);
      setPendingFilterRequest(request);
      return request;
    } catch {
      setFeedback("storage");
      return null;
    }
  }

  function applyTerminalResult(result: Exclude<SaveRoomFiltersResult, { status: "error" }>): void {
    switch (result.status) {
      case "saved":
        setFilters(result.filters);
        setSavedFilters(result.filters);
        setFeedback("saved");
        break;
      case "unavailable":
        setUnavailable(true);
        break;
      case "validation_error":
      case "conflict":
        setFeedback(result.status);
        break;
      default:
        assertNever(result);
    }
  }

  async function submitSave(): Promise<void> {
    const storage = new FilterRequestStorage(window.sessionStorage, roomCode);
    const request = prepareRequest(storage);
    if (request === null) {
      return;
    }
    const result = await saveRoomFiltersAction({ roomCode, ...request });
    if (result.status === "error") {
      setFeedback("retry");
      return;
    }
    // A terminal response confirms that this exact persisted request is resolved.
    storage.clear(request.requestId);
    setPendingFilterRequest(null);
    applyTerminalResult(result);
  }

  function save(): void {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    startSaving(async () => {
      try {
        await submitSave();
      } catch {
        setFeedback("retry");
      } finally {
        savingRef.current = false;
      }
    });
  }

  function start(): void {
    if (startingRef.current || savingRef.current || (pendingGameRequest === null && (hasUnsavedChanges || pendingFilterRequest !== null))) {
      return;
    }

    startingRef.current = true;
    startStarting(async () => {
      const storage = new GameCommandRequestStorage(window.sessionStorage, roomCode, "start");
      let request: PendingGameCommand;

      try {
        request = pendingGameRequest ?? { requestId: crypto.randomUUID() };
        storage.persist(request);
        setPendingGameRequest(request);
      } catch {
        setGameFeedback("storage");
        startingRef.current = false;
        return;
      }

      try {
        const result = await startGameAction({ roomCode, requestId: request.requestId });

        if (result.status === "error") {
          setGameFeedback("retry");
          return;
        }

        storage.clear(request.requestId);
        setPendingGameRequest(null);
        applyGameResult(result);
      } catch {
        setGameFeedback("retry");
      } finally {
        startingRef.current = false;
      }
    });
  }

  function applyGameResult(result: Exclude<PublicGameCommandResult, { status: "error" }>): void {
    switch (result.status) {
      case "started":
      case "exhausted":
      case "unavailable":
      case "validation_error":
      case "conflict":
        setGameFeedback(result.status);
        return;
      default:
        return assertNever(result);
    }
  }

  if (unavailable) {
    return (
      <p className="mt-6 text-slate-300" role="alert">
        {t("unavailable")}
      </p>
    );
  }

  let submitLabel = t("save");
  if (pendingFilterRequest !== null) {
    submitLabel = t("retry");
  }
  if (saving) {
    submitLabel = t("saving");
  }

  return (
    <form
      className="mt-8 space-y-5 border-t border-white/10 pt-7"
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
      aria-busy={saving || starting}
    >
      <h2 className="text-2xl font-bold">{t("title")}</h2>
      <p className="text-sm leading-6 text-slate-300">{t("description")}</p>
      <FilterFields
        disabled={saving || starting || pendingFilterRequest !== null || pendingGameRequest !== null}
        filters={filters}
        genres={initialSnapshot.genres}
        onChange={updateFilters}
      />
      {feedback === "idle" ? null : <FilterFeedback feedback={feedback} />}
      <PrimaryButton busy={saving} className="w-full" disabled={saving || starting || pendingGameRequest !== null} submit>
        {submitLabel}
      </PrimaryButton>
      <div className="border-t border-white/10 pt-6">
        <p className="text-sm leading-6 text-slate-300">
          {participantCount < 2 ? t("startWaiting") : hasUnsavedChanges ? t("startSaveFirst") : t("startReady")}
        </p>
        {gameFeedback === "idle" ? null : <GameFeedbackMessage feedback={gameFeedback} />}
        <PrimaryButton
          busy={starting}
          className="mt-4 w-full"
          disabled={
            starting ||
            saving ||
            participantCount !== 2 ||
            (pendingGameRequest === null && (hasUnsavedChanges || pendingFilterRequest !== null)) ||
            gameFeedback === "storage"
          }
          onClick={start}
        >
          {starting ? t("starting") : pendingGameRequest === null ? t("start") : t("retryStart")}
        </PrimaryButton>
      </div>
    </form>
  );
}

function equalFilters(left: RoomFilterValues, right: RoomFilterValues): boolean {
  return (
    left.netflixOnly === right.netflixOnly &&
    left.underTwoHours === right.underTwoHours &&
    left.yearFilter === right.yearFilter &&
    left.genreIds.length === right.genreIds.length &&
    [...left.genreIds].sort((a, b) => a - b).every((id, index) => id === [...right.genreIds].sort((a, b) => a - b)[index])
  );
}

function FilterFields({
  disabled,
  filters,
  genres,
  onChange,
}: Readonly<{
  disabled: boolean;
  filters: RoomFilterValues;
  genres: RoomFilterSnapshot["genres"];
  onChange(filters: RoomFilterValues): void;
}>): ReactNode {
  const t = useTranslations("HostFilters");

  return (
    <fieldset
      className="space-y-5 disabled:opacity-60 disabled:[&_label]:cursor-not-allowed disabled:[&_select]:cursor-not-allowed"
      disabled={disabled}
    >
      <legend className="sr-only">{t("title")}</legend>
      <FilterCheckbox checked={filters.netflixOnly} label={t("netflix")} onChange={checked => onChange({ ...filters, netflixOnly: checked })} />
      <FilterCheckbox checked={filters.underTwoHours} label={t("runtime")} onChange={checked => onChange({ ...filters, underTwoHours: checked })} />
      <label className="block">
        <span className="font-semibold">{t("year")}</span>
        <span className="relative mt-2 block">
          <select
            className="w-full cursor-pointer appearance-none rounded-xl border border-white/15 bg-slate-950 p-3 pr-12"
            value={filters.yearFilter}
            onChange={event => onChange({ ...filters, yearFilter: yearFilterSchema.parse(event.target.value) })}
          >
            <option value="any">{t("yearAny")}</option>
            <option value="new">{t("yearNew")}</option>
            <option value="old">{t("yearOld")}</option>
          </select>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </label>
      <fieldset className="space-y-3">
        <legend className="font-semibold">{t("genres")}</legend>
        <p className="text-sm leading-6 text-slate-400">{t("genresHint")}</p>
        {genres.length === 0 ? (
          <p className="text-sm text-slate-400">{t("noGenres")}</p>
        ) : (
          genres.map(genre => (
            <FilterCheckbox
              key={genre.id}
              checked={filters.genreIds.includes(genre.id)}
              label={genre.name}
              onChange={checked =>
                onChange({
                  ...filters,
                  genreIds: checked ? [...filters.genreIds, genre.id] : filters.genreIds.filter(id => id !== genre.id),
                })
              }
            />
          ))
        )}
      </fieldset>
    </fieldset>
  );
}

function FilterCheckbox({ checked, label, onChange }: Readonly<{ checked: boolean; label: ReactNode; onChange(checked: boolean): void }>): ReactNode {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        className="size-5 cursor-pointer accent-amber-400 disabled:cursor-not-allowed"
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function FilterFeedback({ feedback }: Readonly<{ feedback: VisibleFeedback }>): ReactNode {
  const t = useTranslations("HostFilters");
  const saved = feedback === "saved";

  return (
    <p
      className={`rounded-xl p-4 text-sm leading-6 ring-1 ${
        saved ? "bg-emerald-950/60 text-emerald-200 ring-emerald-400/20" : "bg-rose-950/60 text-rose-200 ring-rose-400/20"
      }`}
      role={saved ? "status" : "alert"}
    >
      {t(feedback === "retry" ? "retryMessage" : feedback)}
    </p>
  );
}

function GameFeedbackMessage({ feedback }: Readonly<{ feedback: VisibleGameFeedback }>): ReactNode {
  const t = useTranslations("HostFilters");
  const completed = feedback === "started" || feedback === "exhausted";

  return (
    <p
      className={`mt-4 rounded-xl p-4 text-sm leading-6 ring-1 ${
        completed ? "bg-emerald-950/60 text-emerald-200 ring-emerald-400/20" : "bg-rose-950/60 text-rose-200 ring-rose-400/20"
      }`}
      role={completed ? "status" : "alert"}
    >
      {t(`startFeedback.${feedback}`)}
    </p>
  );
}
