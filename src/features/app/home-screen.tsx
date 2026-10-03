"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { logout } from "../../../app/auth/actions";
import { useAccountState } from "@/features/account/use-account-state";
import { localDatabase } from "@/storage/local/database";

import { LanguageSwitcher } from "./language-switcher";

interface WaitingPause {
  id: string;
  started_at: string;
}

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { state } = useAccountState();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState<WaitingPause[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const setting = await localDatabase.settings.get("onboardingCompleted");
      if (!cancelled) setOnboarded(setting?.value === true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // In-app inbox: pauses created by broker events wait here even if a push never arrives.
  const signedIn = Boolean(state?.user);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/pauses", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { pauses: WaitingPause[] };
        if (!cancelled) setWaiting(body.pauses);
      } catch {
        // Offline: the inbox is a convenience, not required.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return (
    <main className="shell stack">
      <header className="stack">
        <span className="muted">{t("common.appName")}</span>
        <h1>{t("home.title")}</h1>
        <p>{t("home.body")}</p>
        {state?.user ? (
          <div className="p-3 bg-blue-50 text-blue-900 rounded-lg text-sm flex justify-between items-center">
            <span>{t("home.signedInAs", { email: state.user.email ?? "" })}</span>
            <form action={logout}>
              <button className="underline font-medium">{t("home.logout")}</button>
            </form>
          </div>
        ) : (
          <p className="muted">{t("home.guestNote")}</p>
        )}
      </header>

      {waiting.length > 0 && (
        <section className="card stack" aria-labelledby="inbox-title">
          <h2 id="inbox-title">{t("home.inboxTitle")}</h2>
          {waiting.map((pause) => (
            <a key={pause.id} className="button" href={`/pause?pauseId=${pause.id}`}>
              {t("home.inboxItem", { time: new Date(pause.started_at).toLocaleString(i18n.language) })}
            </a>
          ))}
        </section>
      )}

      <section className="card stack">
        <LanguageSwitcher />
        {onboarded ? (
          <>
            <Link className="button" href="/checkin">
              {t("home.checkin")}
            </Link>
            <Link className="button secondary" href="/pact">
              {t("home.pact")}
            </Link>
            <Link className="button secondary" href="/settings">
              {t("home.settings")}
            </Link>
          </>
        ) : (
          <Link className="button" href="/onboarding">
            {t("home.start")}
          </Link>
        )}
        <Link className="button secondary" href="/about">
          {t("home.about")}
        </Link>
      </section>

      <section className="card stack">
        <h2 className="text-lg font-bold">Hackathon Demo Features</h2>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Link className="button secondary text-sm py-2" href="/import">Local Import & Review</Link>
          <Link className="button secondary text-sm py-2" href="/simulator">Monte Carlo Simulator</Link>
          <Link className="button bg-red-100 text-red-900 text-sm py-2" href="/panic">Panic Companion</Link>
          <Link className="button secondary text-sm py-2" href="/review">Post-Loss Review</Link>
        </div>
      </section>
      <p className="muted">{t("common.limitation")}</p>
    </main>
  );
}
