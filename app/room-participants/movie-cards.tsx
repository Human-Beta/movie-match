"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { formatRuntime } from "@/app/room-participants/format-runtime";
import styles from "@/app/room-participants/round-result-animation.module.css";
import { ROUND_STATUS } from "@/lib/game-rounds/round-status";
import type { PublicRoomMovie, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

const GAME_ROUND_NAMESPACE = "GameRound";

export function MovieCards({
  compactOnNarrow = false,
  round,
  renderFooter,
}: Readonly<{
  compactOnNarrow?: boolean;
  round: PublicRoomRound;
  renderFooter?: (movie: PublicRoomMovie) => ReactNode;
}>): ReactNode {
  const t = useTranslations(GAME_ROUND_NAMESPACE);
  const tResult = useTranslations("RoundResult");
  const persistedSelectedMovieId =
    round.status === ROUND_STATUS.MATCHED && round.result?.status === ROUND_STATUS.MATCHED ? round.result.selectedMovieId : null;
  const selectedMovieId = round.movies.some(movie => movie.movieId === persistedSelectedMovieId) ? persistedSelectedMovieId : null;

  return (
    <section aria-labelledby="current-round-title" className={styles.resultAnimation}>
      <h2 className={compactOnNarrow ? "text-xl font-bold sm:text-2xl" : "text-2xl font-bold"} id="current-round-title">
        {t("round", { number: round.roundNumber })}
      </h2>
      <div className={compactOnNarrow ? "mt-4 grid gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-5" : "mt-6 grid gap-5 sm:grid-cols-3"}>
        {round.movies.map(movie => {
          const isSelected = selectedMovieId === movie.movieId;
          let resultClassName: string | undefined;

          if (isSelected) {
            resultClassName = styles.selectedCard;
          } else if (selectedMovieId !== null) {
            resultClassName = styles.mutedCard;
          }

          return (
            <article
              className={`relative flex h-full min-w-0 flex-col overflow-hidden bg-slate-900 ring-1 ring-white/10 ${compactOnNarrow ? "rounded-2xl sm:rounded-3xl" : "rounded-3xl"} ${resultClassName ?? ""}`}
              key={movie.movieId}
            >
              <MoviePoster hiddenOnNarrow={compactOnNarrow} movie={movie} />
              <div className={compactOnNarrow ? "flex flex-1 flex-col p-4 sm:p-5" : "flex flex-1 flex-col p-5"}>
                <p className="text-xs font-semibold tracking-[0.2em] text-amber-400 uppercase">{t("position", { position: movie.position })}</p>
                <h3 className={`mt-2 font-bold break-words text-white ${compactOnNarrow ? "text-lg sm:text-xl" : "text-xl"}`}>{movie.title}</h3>
                <p className={`mt-3 text-sm text-slate-300 ${compactOnNarrow ? "hidden sm:block" : ""}`}>
                  {t("details", { year: movie.releaseYear, runtime: formatRuntime(movie.runtimeMinutes) })}
                </p>
                <p className={`mt-2 text-sm leading-6 text-slate-400 ${compactOnNarrow ? "hidden sm:block" : ""}`}>
                  {movie.genres.length === 0 ? t("genresFallback") : movie.genres.join(", ")}
                </p>
                {renderFooter === undefined ? null : (
                  <div className={compactOnNarrow ? "mt-4 sm:mt-auto sm:pt-5" : "mt-auto pt-5"}>{renderFooter(movie)}</div>
                )}
              </div>
              {isSelected ? (
                <p
                  aria-label={tResult("selectedMovieLabel", { title: movie.title })}
                  className={`${styles.selectedLabel} absolute top-4 left-4 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black tracking-[0.16em] text-emerald-950 uppercase`}
                >
                  {tResult("selected")}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MoviePoster({ hiddenOnNarrow = false, movie }: Readonly<{ hiddenOnNarrow?: boolean; movie: PublicRoomMovie }>): ReactNode {
  const t = useTranslations(GAME_ROUND_NAMESPACE);
  const [failed, setFailed] = useState(false);

  if (movie.posterPath === null || failed) {
    return (
      <div
        className={`flex aspect-[2/3] items-center justify-center bg-slate-800 p-5 text-center text-sm text-slate-400 ${hiddenOnNarrow ? "hidden sm:flex" : ""}`}
        role="img"
        aria-label={t("posterFallback", { title: movie.title })}
      >
        <span>
          <span className="block text-5xl" aria-hidden="true">
            🎬
          </span>
          <span className="mt-3 block">{t("posterUnavailable")}</span>
        </span>
      </div>
    );
  }

  return (
    // Poster paths may be first-party files or curated external URLs, so the browser loads the exact catalog value.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={t("posterAlt", { title: movie.title })}
      className={`aspect-[2/3] w-full bg-slate-800 object-cover ${hiddenOnNarrow ? "hidden sm:block" : ""}`}
      onError={() => {
        setFailed(true);
      }}
      src={movie.posterPath}
    />
  );
}
