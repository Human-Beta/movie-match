import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export default function JoinRoomLoading(): ReactNode {
  const t = useTranslations("JoinRoom");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <p className="text-lg text-slate-300" aria-live="polite">
        {t("status.checkingRoom")}
      </p>
    </main>
  );
}
