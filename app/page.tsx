import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export default function Home(): ReactNode {
  const t = useTranslations("Home");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-2xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-[0.3em] text-amber-400 uppercase">Movie Match</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t("title")}</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">{t("description")}</p>
      </section>
    </main>
  );
}
