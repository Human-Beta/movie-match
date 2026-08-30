import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { DEFAULT_LOCALE } from "@/i18n/config";

import "@/app/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");

  return {
    title: "Movie Match",
    description: t("description"),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactNode {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
