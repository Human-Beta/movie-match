import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export default function TvRoomLoading(): ReactNode {
  const t = useTranslations("TvRoom");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <p className="text-lg text-slate-300">{t("checkingRoom")}</p>
    </main>
  );
}
