"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { logout } from "../../../app/auth/actions";
import { LanguageSwitcher } from "./language-switcher";
import { User } from "@supabase/supabase-js";

export function HomeScreen({ user }: { user?: User | null }) {
  const { t } = useTranslation();
  return (
    <main className="shell stack">
      <header className="stack">
        <span className="muted">{t("common.appName")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
        {user && (
          <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm flex justify-between items-center">
            <span>Signed in as {user.email}</span>
            <form action={logout}>
              <button className="text-blue-700 underline font-medium">Log out</button>
            </form>
          </div>
        )}
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
