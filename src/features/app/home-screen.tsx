"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "./language-switcher";

export function HomeScreen() {
  const { t } = useTranslation();
  return (
    <main className="shell stack">
      <header className="stack">
        <span className="muted">{t("common.appName")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
      </header>
      <section className="card stack">
        <LanguageSwitcher />
        <Link className="button" href="/onboarding">
          {t("home.start")}
        </Link>
        <Link className="button secondary" href="/about">
          {t("home.about")}
        </Link>
      </section>
      <p className="muted">{t("common.foundationNotice")}</p>
    </main>
  );
}
