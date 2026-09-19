"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { formatRuntime } from "@/app/room-participants/format-runtime";
import type { PublicRoomMovie, PublicRoomRound } from "@/lib/participants/public-participant-snapshot";

const GAME_ROUND_NAMESPACE = "GameRound";

export function MovieCards({
  round,
  renderFooter,
}: Readonly<{
  round: PublicRoomRound;
  renderFooter?: (movie: PublicRoomMovie) => ReactNode;
}>): ReactNode {
  const t = useTranslations(GAME_ROUND_NAMESPACE);

  return (
    <section aria-labelledby="current-round-title">
      <h2 className="text-2xl font-bold" id="current-round-title">
        {t("round", { number: round.roundNumber })}
      </h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {round.movies.map(movie => (
          <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-white/10" key={movie.movieId}>
            <MovieCardContent movie={movie} renderFooter={renderFooter} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function MovieCardContent({
  movie,
  renderFooter,
}: Readonly<{
  movie: PublicRoomMovie;
  renderFooter?: (movie: PublicRoomMovie) => ReactNode;
}>): ReactNode {
  const t = useTranslations(GAME_ROUND_NAMESPACE);

  return (
    <>
      <MoviePoster movie={movie} />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold tracking-[0.2em] text-amber-400 uppercase">{t("position", { position: movie.position })}</p>
        <h3 className="mt-2 text-xl font-bold text-white">{movie.title}</h3>
        <p className="mt-3 text-sm text-slate-300">{t("details", { year: movie.releaseYear, runtime: formatRuntime(movie.runtimeMinutes) })}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">{movie.genres.length === 0 ? t("genresFallback") : movie.genres.join(", ")}</p>
        {renderFooter === undefined ? null : <div className="mt-auto pt-5">{renderFooter(movie)}</div>}
      </div>
    </>
  );
}

function MoviePoster({ movie }: Readonly<{ movie: PublicRoomMovie }>): ReactNode {
  const t = useTranslations(GAME_ROUND_NAMESPACE);
  const [failed, setFailed] = useState(false);

  if (movie.posterPath === null || failed) {
    return (
      <div
        className="flex aspect-[2/3] items-center justify-center bg-slate-800 p-5 text-center text-sm text-slate-400"
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
      className="aspect-[2/3] w-full bg-slate-800 object-cover"
      onError={() => {
        setFailed(true);
      }}
      src={movie.posterPath}
    />
  );
}
