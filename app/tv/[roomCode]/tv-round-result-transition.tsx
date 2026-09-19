"use client";

import { AnimatePresence, domMax, LazyMotion, LayoutGroup, m, useReducedMotion } from "motion/react";
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
import { useResultRevealPublisher } from "@/app/room-participants/use-result-reveal-publisher";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomMovie, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

const ROUND_RESULT_NAMESPACE = "RoundResult";

export function TvRoundResultTransition({
  onNoMatchTransitionComplete,
  realtimeTopic,
  round,
}: Readonly<{
  onNoMatchTransitionComplete(presentationKey: string): void;
  realtimeTopic: string;
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

  return (
    <TerminalRoundTransition onNoMatchTransitionComplete={onNoMatchTransitionComplete} presentation={presentation} realtimeTopic={realtimeTopic} />
  );
}

function TerminalRoundTransition({
  onNoMatchTransitionComplete,
  presentation,
  realtimeTopic,
}: Readonly<{
  onNoMatchTransitionComplete(presentationKey: string): void;
  presentation: TerminalRoundPresentation;
  realtimeTopic: string;
}>): ReactNode {
  const reducedMotion = useReducedMotion() === true;
  const publishResultReveal = useResultRevealPublisher(realtimeTopic);
  const [stage, setStage] = useState<RoundResultTransitionStage>(() => getInitialRoundResultTransitionStage(presentation, reducedMotion));
  const getCurrentPresentation = useEffectEvent((): TerminalRoundPresentation => presentation);
  const onTransitionComplete = useEffectEvent((completedPresentation: TerminalRoundPresentation): void => {
    publishResultReveal(completedPresentation);

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

  return (
    <LazyMotion features={domMax} strict>
      <LayoutGroup id={presentation.key}>
        {presentation.status === ROUND_STATUS.MATCHED ? (
          <MatchTransition presentation={presentation} stage={stage} />
        ) : (
          <NoMatchTransition presentation={presentation} stage={stage} />
        )}
      </LayoutGroup>
    </LazyMotion>
  );
}

function MatchTransition({
  presentation,
  stage,
}: Readonly<{ presentation: TerminalRoundPresentation; stage: RoundResultTransitionStage }>): ReactNode {
  const t = useTranslations(ROUND_RESULT_NAMESPACE);
  const selectedMovie = presentation.selectedMovie;

  if (selectedMovie === null) {
    return <StableRoundResult presentation={presentation} />;
  }

  const selectedLayoutId = `round-result-movie-${presentation.round.roundId}-${selectedMovie.movieId}`;

  return (
    <div className="overflow-x-hidden">
      <AnimatePresence initial={false} mode="sync">
        {stage === "match_emphasis" ? (
          <m.section animate={{ opacity: 1 }} className="relative" exit={{ opacity: 0 }} key="grid" transition={{ duration: 0.2 }}>
            <p className="sr-only" role="status">
              {t("transition.selectedMovie", { title: selectedMovie.title })}
            </p>
            <TvRoundMovieGrid presentation={presentation} selectedLayoutId={selectedLayoutId} emphasizeSelected />
          </m.section>
        ) : null}
        {stage === "match_expanding" ? (
          <m.section
            animate={{ opacity: 1 }}
            aria-label={t("matchedTitle")}
            className="fixed inset-0 z-10 overflow-y-auto bg-slate-950 px-6 py-10 text-slate-50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="expanding-result"
            transition={{ opacity: { duration: 0.2 } }}
          >
            <div className="mx-auto w-full max-w-3xl">
              <m.article
                className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-emerald-300/40"
                layoutId={selectedLayoutId}
                transition={{ layout: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }}
              >
                <MovieCardContent movie={selectedMovie} />
              </m.article>
              <RoundResult round={presentation.round} />
            </div>
          </m.section>
        ) : null}
      </AnimatePresence>
      {stage === "stable" ? <StableRoundResult presentation={presentation} /> : null}
    </div>
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
      <m.div animate={{ opacity: 0.52, scale: 0.97 }} transition={{ duration: 0.35, ease: "easeOut" }}>
        <TvRoundMovieGrid presentation={presentation} />
      </m.div>
      <AnimatePresence initial={false} mode="wait">
        <m.section
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-full max-w-xl -translate-y-1/2 rounded-3xl bg-slate-900/95 p-8 text-center shadow-2xl ring-1 ring-white/15"
          initial={{ opacity: 0, y: 16 }}
          key="no-match-reaction"
          role="status"
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <p className="text-5xl" aria-hidden="true">
            🫶
          </p>
          <h2 className="mt-4 text-3xl font-bold">{t("noMatchTitle")}</h2>
          <p className="mt-3 text-lg leading-8 text-slate-200">{t("transition.noMatchReaction")}</p>
        </m.section>
      </AnimatePresence>
    </div>
  );
}

function TvRoundMovieGrid({
  emphasizeSelected = false,
  presentation,
  selectedLayoutId,
}: Readonly<{
  emphasizeSelected?: boolean;
  presentation: TerminalRoundPresentation;
  selectedLayoutId?: string;
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
            layoutId={movie.movieId === presentation.selectedMovie?.movieId ? selectedLayoutId : undefined}
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
  layoutId,
  movie,
  muted,
  selectedLabel,
}: Readonly<{
  emphasize: boolean;
  layoutId: string | undefined;
  movie: PublicRoomMovie;
  muted: boolean;
  selectedLabel: string;
}>): ReactNode {
  return (
    <m.article
      animate={emphasize ? { opacity: 1, scale: 1.035 } : { opacity: muted ? 0.52 : 1, scale: 1 }}
      className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-white/10"
      layoutId={layoutId}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <MovieCardContent movie={movie} />
      {emphasize ? (
        <p className="absolute top-4 left-4 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black tracking-[0.16em] text-emerald-950 uppercase">
          {selectedLabel}
        </p>
      ) : null}
    </m.article>
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
