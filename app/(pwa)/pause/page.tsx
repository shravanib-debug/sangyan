"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";

import type { RiskTier } from "@/engine/types";
import { describeHit } from "@/features/pause/describe-hit";
import {
  fetchRemotePause,
  loadLocalPause,
  remainingSeconds,
  resolvePause,
  type PauseView
} from "@/services/pause-service";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem } from "@/storage/local/sync";

const tierStyle: Record<RiskTier, string> = {
  L0: "bg-green-100 text-green-900 border-green-300",
  L1: "bg-yellow-100 text-yellow-900 border-yellow-300",
  L2: "bg-orange-100 text-orange-900 border-orange-300",
  L3: "bg-red-100 text-red-900 border-red-300"
};

function PauseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pauseId = useSearchParams()?.get("pauseId") ?? null;

  const [view, setView] = useState<PauseView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pauseId) {
        setState("missing");
        return;
      }
      // Local first (works offline); a broker-originated pause is fetched once and cached.
      const found = (await loadLocalPause(localDatabase, pauseId)) ?? (await fetchRemotePause(localDatabase, pauseId));
      if (cancelled) return;
      setView(found);
      setNow(Date.now());
      setState(found ? "ready" : "missing");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pauseId]);

  // The countdown derives from the stored expiry, so a reload cannot reset or skip it.
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);

  const decide = async (outcome: "continued" | "abandoned") => {
    if (view) {
      await resolvePause(view.pause.id, outcome, {
        db: localDatabase,
        enqueue: (entityType, payload, id) => enqueueSyncItem(entityType, payload, id)
      });
    }
    router.push("/home");
  };

  if (state === "loading") return <div className="p-8 text-center">{t("pause.loading")}</div>;
  if (state === "missing" || !view || now === null) {
    return (
      <div className="p-8 text-center space-y-4">
        <p>{t("pause.notFound")}</p>
        <button onClick={() => router.push("/home")} className="underline font-medium">
          {t("common.backHome")}
        </button>
      </div>
    );
  }

  const { pause, assessment, simulated } = view;
  const seconds = remainingSeconds(pause, now);
  const locked = pause.tier === "L3" && seconds > 0;
  const waiting = pause.tier !== "L3" && seconds > 0;
  const decided = pause.outcome !== "waiting";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 text-center">{t("pause.title")}</h1>

        {simulated && (
          <div role="status" className="p-3 rounded-xl border border-blue-300 bg-blue-50 text-blue-900 text-sm">
            {t("pause.simulatedBanner")}
          </div>
        )}

        <div className={`p-6 rounded-2xl border ${tierStyle[pause.tier]}`}>
          <div className="text-xl font-bold mb-1">
            {pause.tier} · {t(`pause.${pause.tier.toLowerCase()}` as "pause.l0")}
          </div>
          <div className="text-sm">{t("pause.scoreLine", { score: Math.round(assessment.score * 100) })}</div>

          <h2 className="font-bold mt-4 mb-2">{t("pause.explanationTitle")}</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            {assessment.signalHits.map((hit) => {
              const description = describeHit(hit);
              const params = {
                ...description.params,
                observed: description.observedKey ? t(description.observedKey as "signal.sourceName.surplus") : description.params.observed,
                threshold: description.thresholdKey ? t(description.thresholdKey as "signal.sourceName.surplus") : description.params.threshold
              };
              return <li key={hit.explanationCode}>{t(description.key as "signal.revenge.triggered", params)}</li>;
            })}
            {assessment.hardRuleOverrides.map((rule) => (
              <li key={rule} className="font-semibold">
                {t(`pause.override.${rule}` as "pause.override.pact_breach_lock")}
              </li>
            ))}
          </ul>
        </div>

        {!decided && (
          <div className="space-y-4">
            {locked ? (
              <div role="timer" className="p-4 bg-gray-200 text-gray-900 text-center rounded-xl font-bold tabular-nums">
                {t("pause.lockRemaining", { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })}
              </div>
            ) : waiting ? (
              <div role="timer" className="p-4 bg-gray-200 text-gray-900 text-center rounded-xl font-bold tabular-nums">
                {t("pause.timer", { seconds })}
              </div>
            ) : (
              <button
                onClick={() => void decide("continued")}
                className="w-full p-4 bg-white border-2 border-gray-300 text-gray-900 rounded-xl font-bold hover:bg-gray-50 transition-colors"
              >
                {t("pause.continue")}
              </button>
            )}
            <button
              onClick={() => void decide("abandoned")}
              className="w-full p-4 bg-gray-900 text-white rounded-xl font-bold shadow-md hover:bg-black transition-colors"
            >
              {t("pause.abandon")}
            </button>
          </div>
        )}

        <aside className="text-xs text-gray-600 border-t border-gray-200 pt-4">
          <strong>{t("pause.limitationTitle")}: </strong>
          {t("common.limitation")}
        </aside>
      </div>
    </div>
  );
}

export default function PausePage() {
  return (
    <Suspense fallback={null}>
      <PauseScreen />
    </Suspense>
  );
}
