"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { TV_ROOM_STORAGE_KEY } from "@/app/tv/storage";

export function NewRoomLink(): ReactNode {
  const t = useTranslations("TvRoom");

  return (
    <Link
      className="mt-8 inline-flex rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-amber-300"
      href="/tv"
      onClick={() => {
        try {
          window.localStorage.removeItem(TV_ROOM_STORAGE_KEY);
        } catch {
          // The destination handles unavailable local storage for the user.
        }
      }}
    >
      {t("newRoom")}
    </Link>
  );
}
