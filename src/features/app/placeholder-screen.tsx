"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

type ScreenKey =
  | "onboarding"
  | "pact"
  | "checkin"
  | "pause"
  | "journal"
  | "import"
  | "review"
  | "simulator"
  | "panic"
  | "settings"
  | "login"
  | "about";

export function PlaceholderScreen({ screen }: Readonly<{ screen: ScreenKey }>) {
  const { t } = useTranslation();
  return (
    <main className="shell stack">
      <section className="card stack">
        <span className="muted">{t("common.appName")}</span>
        <h1>{t(`screens.${screen}`)}</h1>
        <p>{t("common.foundationNotice")}</p>
        <Link className="button secondary" href="/home">
          {t("common.backHome")}
        </Link>
      </section>
    </main>
  );
}
