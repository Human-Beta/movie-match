"use client";

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { MovieCardContent, MovieCards } from "@/app/room-participants/movie-cards";
import {
  getInitialRoundResultTransitionStage,
  RoundResultTransitionController,
  type RoundResultTransitionStage,
} from "@/app/room-participants/round-result-transition-controller";
import { getTerminalRoundPresentation, type TerminalRoundPresentation } from "@/app/room-participants/round-result-presentation";
import { RoundResult } from "@/app/room-participants/round-result";
import { browserTimerScheduler } from "@/app/room-participants/timer-scheduler";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomMovie, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

const ROUND_RESULT_NAMESPACE = "RoundResult";

export function TvRoundResultTransition({
  onNoMatchTransitionComplete,
  round,
}: Readonly<{
  onNoMatchTransitionComplete(presentationKey: string): void;
  round: PublicRoomRound;
}>): ReactNode {
  const presentation = getTerminalRoundPresentation(round);

  if (presentation === null) {
    return (
      <>
        <MovieCards round={round} />
        <RoundResult round={round} />
      </>
    );
  }

  return <TerminalRoundTransition onNoMatchTransitionComplete={onNoMatchTransitionComplete} presentation={presentation} />;
}

function TerminalRoundTransition({
  onNoMatchTransitionComplete,
  presentation,
}: Readonly<{
  onNoMatchTransitionComplete(presentationKey: string): void;
  presentation: TerminalRoundPresentation;
}>): ReactNode {
  const reducedMotion = usePrefersReducedMotion();
  const [stage, setStage] = useState<RoundResultTransitionStage>(() => getInitialRoundResultTransitionStage(presentation, reducedMotion));
  const getCurrentPresentation = useEffectEvent((): TerminalRoundPresentation => presentation);
  const onTransitionComplete = useEffectEvent((completedPresentation: TerminalRoundPresentation): void => {
    if (completedPresentation.status === ROUND_STATUS.NO_MATCH) {
      onNoMatchTransitionComplete(completedPresentation.key);
    }
  });

  useEffect(() => {
    const currentPresentation = getCurrentPresentation();
    const controller = new RoundResultTransitionController({
      onComplete: (completedPresentation): void => {
        onTransitionComplete(completedPresentation);
      },
      onStageChange: setStage,
      presentation: currentPresentation,
      reducedMotion,
      scheduler: browserTimerScheduler,
    });

    controller.start();

    return (): void => {
      controller.stop();
    };
  }, [presentation.key, reducedMotion]);

  if (presentation.status === ROUND_STATUS.MATCHED) {
    return <MatchTransition presentation={presentation} stage={stage} />;
  }

  return <NoMatchTransition presentation={presentation} stage={stage} />;
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = (): void => {
      setReducedMotion(mediaQuery.matches);
    };

    updateReducedMotion();
    mediaQuery.addEventListener("change", updateReducedMotion);

    return (): void => {
      mediaQuery.removeEventListener("change", updateReducedMotion);
    };
  }, []);

  return reducedMotion;
}

function MatchTransition({
  presentation,
  stage,
}: Readonly<{ presentation: TerminalRoundPresentation; stage: RoundResultTransitionStage }>): ReactNode {
  const t = useTranslations(ROUND_RESULT_NAMESPACE);
  const selectedMovie = presentation.selectedMovie;

  if (selectedMovie === null || stage === "stable") {
    return <StableRoundResult presentation={presentation} />;
  }

  return (
    <section>
      <p className="sr-only" role="status">
        {t("transition.selectedMovie", { title: selectedMovie.title })}
      </p>
      <TvRoundMovieGrid emphasizeSelected presentation={presentation} />
    </section>
  );
}

function NoMatchTransition({
  presentation,
  stage,
}: Readonly<{ presentation: TerminalRoundPresentation; stage: RoundResultTransitionStage }>): ReactNode {
  const t = useTranslations(ROUND_RESULT_NAMESPACE);

  if (stage === "stable") {
    return <StableRoundResult presentation={presentation} />;
  }

  return (
    <div className="relative overflow-x-hidden">
      <div className="scale-[0.97] opacity-50 transition duration-300 ease-out">
        <TvRoundMovieGrid presentation={presentation} />
      </div>
      <section
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-full max-w-xl -translate-y-1/2 rounded-3xl bg-slate-900/95 p-8 text-center shadow-2xl ring-1 ring-white/15"
        role="status"
      >
        <p className="text-5xl" aria-hidden="true">
          🫶
        </p>
        <h2 className="mt-4 text-3xl font-bold">{t("noMatchTitle")}</h2>
        <p className="mt-3 text-lg leading-8 text-slate-200">{t("transition.noMatchReaction")}</p>
      </section>
    </div>
  );
}

function TvRoundMovieGrid({
  emphasizeSelected = false,
  presentation,
}: Readonly<{
  emphasizeSelected?: boolean;
  presentation: TerminalRoundPresentation;
}>): ReactNode {
  const t = useTranslations("GameRound");
  const tResult = useTranslations(ROUND_RESULT_NAMESPACE);

  return (
    <section aria-labelledby="current-round-title">
      <h2 className="text-2xl font-bold" id="current-round-title">
        {t("round", { number: presentation.round.roundNumber })}
      </h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {presentation.round.movies.map(movie => (
          <TvRoundMovieCard
            emphasize={emphasizeSelected ? movie.movieId === presentation.selectedMovie?.movieId : false}
            key={movie.movieId}
            movie={movie}
            muted={emphasizeSelected ? movie.movieId !== presentation.selectedMovie?.movieId : false}
            selectedLabel={tResult("selected")}
          />
        ))}
      </div>
    </section>
  );
}

function TvRoundMovieCard({
  emphasize,
  movie,
  muted,
  selectedLabel,
}: Readonly<{
  emphasize: boolean;
  movie: PublicRoomMovie;
  muted: boolean;
  selectedLabel: string;
}>): ReactNode {
  const presentationClassName = emphasize
    ? "scale-[1.035] ring-2 ring-emerald-300/70 shadow-[0_0_2.5rem_rgba(110,231,183,0.45)]"
    : muted
      ? "opacity-50"
      : "";

  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-white/10 transition duration-300 ease-out ${presentationClassName}`}
    >
      <MovieCardContent movie={movie} />
      {emphasize ? (
        <p className="absolute top-4 left-4 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black tracking-[0.16em] text-emerald-950 uppercase">
          {selectedLabel}
        </p>
      ) : null}
    </article>
  );
}

function StableRoundResult({ presentation }: Readonly<{ presentation: TerminalRoundPresentation }>): ReactNode {
  const t = useTranslations(ROUND_RESULT_NAMESPACE);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    resultRef.current?.focus();
  }, [presentation.key]);

  if (presentation.status === ROUND_STATUS.NO_MATCH) {
    return (
      <section ref={resultRef} tabIndex={-1}>
        <MovieCards round={presentation.round} />
        <RoundResult round={presentation.round} />
      </section>
    );
  }

  const selectedMovie = presentation.selectedMovie;

  if (selectedMovie === null) {
    return <RoundResult round={presentation.round} />;
  }

  return (
    <section aria-label={t("matchedRegion")} ref={resultRef} tabIndex={-1}>
      <div className="mx-auto w-full max-w-3xl">
        <article className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-emerald-300/40">
          <MovieCardContent movie={selectedMovie} />
        </article>
        <RoundResult round={presentation.round} />
      </div>
    </section>
  );
}
