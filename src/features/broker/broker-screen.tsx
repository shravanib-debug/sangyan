"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PAUSE_POLICY } from "@/config/defaults";
import { card, primary } from "@/features/app/theme";
import { AssessmentExplanation } from "@/features/pause/signal-lines";
import { DEFAULT_PACT, eventToRow } from "@/lib/pipeline/assess";
import { tradesFromEvents } from "@/lib/pipeline/history";
import { runDemoSession, scenarioPact, type DemoStep } from "@/services/demo-broker";
import { DEFAULT_SCENARIO_ID, DEMO_SCENARIOS, getDemoScenario } from "@/services/demo-scenarios";

interface Readiness {
  angelOne: { appKeyConfigured: boolean };
  pipelineReady: boolean;
}

type ReadinessState = { kind: "checking" } | { kind: "unavailable" } | { kind: "ok"; value: Readiness };

const STEP_MS = 1400;

/** Wall clock for the session seed and day; only called from the click handler. */
const clockNow = () => Date.now();

function formatTime(iso: string, language: string): string {
  return new Date(iso).toLocaleTimeString(language === "en" ? "en-IN" : language, {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatRupees(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusRow({ label, value, tone }: Readonly<{ label: string; value: string; tone: "ok" | "wait" | "info" }>) {
  const dot = tone === "ok" ? "bg-green-600" : tone === "wait" ? "bg-orange-500" : "bg-blue-500";
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-200 last:border-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="flex items-center gap-2 text-sm font-semibold text-right">
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
        {value}
      </dd>
    </div>
  );
}

export function BrokerScreen() {
  const { t, i18n } = useTranslation();
  const [readiness, setReadiness] = useState<ReadinessState>({ kind: "checking" });
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [shown, setShown] = useState(0);
  const [seed, setSeed] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const scenario = getDemoScenario(scenarioId);
  const pact = scenarioPact(scenario, DEFAULT_PACT);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/brokers/readiness", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<Readiness>) : Promise.reject(new Error("status"))))
      .then((value) => !cancelled && setReadiness({ kind: "ok", value }))
      .catch(() => !cancelled && setReadiness({ kind: "unavailable" }));
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (shown >= steps.length) return;
    timer.current = setTimeout(() => setShown((count) => count + 1), STEP_MS);
    return () => clearTimeout(timer.current);
  }, [shown, steps.length]);

  const runDemo = () => {
    const now = clockNow();
    const nextSeed = now % 1_000_000_007;
    setSeed(nextSeed);
    setSteps(runDemoSession({ scenario, seed: nextSeed, dayEpochMs: now, provider: "angel_one", pact: DEFAULT_PACT }));
    setShown(1);
  };

  const chooseScenario = (id: string) => {
    if (timer.current) clearTimeout(timer.current);
    setScenarioId(id);
    setSteps([]);
    setShown(0);
    setSeed(null);
  };

  const running = steps.length > 0 && shown < steps.length;
  const latest = shown > 0 ? steps[shown - 1] : undefined;
  // Realised P&L per sell comes from the same FIFO pairing the engine uses.
  const pnlByEvent = new Map(
    tradesFromEvents(steps.map(({ event }) => eventToRow(event)))
      .filter((trade) => trade.side === "sell" && trade.pnlPaise !== undefined)
      .map((trade) => [trade.id, trade.pnlPaise as number])
  );

  const appKey =
    readiness.kind === "checking"
      ? { value: t("broker.checking"), tone: "info" as const }
      : readiness.kind === "unavailable"
        ? { value: t("broker.cannotCheck"), tone: "info" as const }
        : readiness.value.angelOne.appKeyConfigured
          ? { value: t("broker.configured"), tone: "ok" as const }
          : { value: t("broker.notConfigured"), tone: "wait" as const };
  const pipeline =
    readiness.kind === "ok" && readiness.value.pipelineReady
      ? { value: t("broker.pipelineReady"), tone: "ok" as const }
      : { value: t("broker.pipelineNotDeployed"), tone: "wait" as const };

  return (
    <main className="responsive-page space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-black">{t("broker.title")}</h1>
        <p className="text-gray-600 font-medium">{t("broker.subtitle")}</p>
      </header>

      <section className={card} aria-labelledby="angel-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="angel-title" className="text-xl font-bold">
            {t("broker.angelOne")}
          </h2>
          <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-900 text-sm font-bold">
            {t("broker.awaitingBadge")}
          </span>
        </div>
        <dl className="mt-3">
          <StatusRow label={t("broker.adapterLabel")} value={t("broker.adapterValue")} tone="ok" />
          <StatusRow label={t("broker.accessLabel")} value={t("broker.accessValue")} tone="ok" />
          <StatusRow label={t("broker.appKeyLabel")} value={appKey.value} tone={appKey.tone} />
          <StatusRow label={t("broker.pipelineLabel")} value={pipeline.value} tone={pipeline.tone} />
          <StatusRow label={t("broker.accountLabel")} value={t("broker.accountValue")} tone="wait" />
          <StatusRow label={t("broker.modeLabel")} value={t("broker.modeValue")} tone="info" />
        </dl>
        <p className="mt-3 p-3 bg-blue-50 border border-blue-300 rounded-xl text-sm">{t("broker.demoNotice")}</p>
      </section>

      <section className={card} aria-labelledby="demo-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="demo-title" className="text-xl font-bold">
            {t("broker.demoTitle")}
          </h2>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">{t("broker.simulatedTag")}</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">{t("broker.demoBody")}</p>
        <label htmlFor="demo-scenario" className="mt-4 block text-sm font-bold text-gray-700">
          {t("broker.scenarioLabel")}
        </label>
        <select
          id="demo-scenario"
          className="mt-1 block w-full p-3 border-2 border-gray-300 rounded-xl bg-white"
          value={scenarioId}
          disabled={running}
          onChange={(event) => chooseScenario(event.target.value)}
        >
          {DEMO_SCENARIOS.map((option) => (
            <option key={option.id} value={option.id}>
              {t(`broker.scenarios.${option.id}.title` as "broker.scenarios.calm-day.title")}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm">{t(`broker.scenarios.${scenario.id}.description` as "broker.scenarios.calm-day.description")}</p>
        <p className="mt-2 text-sm text-gray-600">
          {pact
            ? t("broker.scenarioPact", {
                limit: formatRupees(pact.dailyLossLimitPaise),
                trades: pact.maximumTradesPerDay,
                minutes: pact.cooldownAfterLossMinutes
              })
            : t("broker.noPact")}
        </p>
        <button className={`${primary} mt-4`} onClick={runDemo} disabled={running}>
          {steps.length === 0 ? t("broker.runDemo") : running ? t("broker.running") : t("broker.runAgain")}
        </button>
        {seed !== null && <p className="mt-2 text-xs text-gray-600">{t("broker.seedLine", { seed })}</p>}
      </section>

      {shown > 0 && (
        <section className={card} aria-labelledby="events-title" aria-live="polite">
          <h2 id="events-title" className="text-lg font-bold">
            {t("broker.eventsTitle")}
          </h2>
          <ol className="mt-3 space-y-2">
            {steps.slice(0, shown).map(({ event, result }, index) => {
              const realised = pnlByEvent.get(event.id);
              const previous = new Set(index > 0 ? steps[index - 1]!.result.signalHits.map((hit) => hit.signal) : []);
              const fresh = result.signalHits.filter((hit) => !previous.has(hit.signal));
              return (
              <li key={event.id} className="p-3 bg-gray-50 rounded-xl text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono">{formatTime(event.observedAt, i18n.language)}</span>
                <span className="font-bold">{t(event.side === "buy" ? "broker.buy" : "broker.sell")}</span>
                <span className="font-mono">{event.symbol}</span>
                <span>
                  {t("broker.fill", { quantity: event.quantity, price: formatRupees(event.averagePricePaise ?? 0) })}
                </span>
                {realised !== undefined && (
                  <span className={`font-semibold ${realised < 0 ? "text-red-700" : "text-green-700"}`}>
                    {realised < 0
                      ? t("broker.rowLoss", { amount: formatRupees(-realised) })
                      : t("broker.rowGain", { amount: formatRupees(realised) })}
                  </span>
                )}
                {fresh.map((hit) => (
                  <span key={hit.signal} className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 text-xs font-bold">
                    {t("broker.rowNewSignal", { name: t(`signalNames.${hit.signal}`) })}
                  </span>
                ))}
                <span className="ml-auto flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-900 text-xs font-bold">{result.tier}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                    {t("broker.simulatedTag")}
                  </span>
                </span>
              </li>
              );
            })}
          </ol>
        </section>
      )}

      {latest && (
        <section className={card} aria-labelledby="assessment-title" aria-live="polite">
          <h2 id="assessment-title" className="text-lg font-bold">
            {t("broker.assessmentTitle", { time: formatTime(latest.event.observedAt, i18n.language) })}
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="p-3 bg-gray-50 rounded-xl">
              <dt className="text-sm text-gray-600">{t("broker.tierLabel")}</dt>
              <dd className="text-2xl font-black">{latest.result.tier}</dd>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <dt className="text-sm text-gray-600">{t("broker.scoreLabel")}</dt>
              <dd className="text-2xl font-black">{t("broker.scoreValue", { score: Math.round(latest.result.score * 100) })}</dd>
            </div>
          </dl>
          <h3 className="mt-4 text-sm font-bold text-gray-700">{t("broker.signalsTitle")}</h3>
          {latest.result.signalHits.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {latest.result.signalHits.map((hit) => (
                <li key={hit.explanationCode} className="px-3 py-1 rounded-full bg-gray-100 text-sm font-semibold">
                  {t(`signalNames.${hit.signal}`)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-600">{t("broker.noSignals")}</p>
          )}
          <h3 className="mt-4 text-sm font-bold text-gray-700">{t("broker.whyTitle")}</h3>
          <div className="mt-2">
            <AssessmentExplanation assessment={latest.result} />
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-300">
              <dt className="text-sm text-gray-600">{t("broker.pactDecisionLabel")}</dt>
              <dd className="text-sm font-semibold">
                {!pact
                  ? t("broker.pactNone")
                  : latest.result.hardRuleOverrides.includes("pact_breach_lock")
                    ? t("broker.pactBreached")
                    : t("broker.pactWithin")}
              </dd>
            </div>
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-300">
              <dt className="text-sm text-gray-600">{t("broker.coolingLabel")}</dt>
              <dd className="text-sm font-semibold">
                {!latest.pause
                  ? t("broker.coolingNone")
                  : latest.pause.expiresAt
                    ? t("broker.coolingUntil", {
                        tier: latest.pause.tier,
                        time: formatTime(latest.pause.expiresAt, i18n.language)
                      })
                    : latest.pause.tier === "L1"
                      ? t("broker.coolingL1", { seconds: PAUSE_POLICY.l1Seconds })
                      : t("broker.coolingL2", { minutes: PAUSE_POLICY.l2Seconds / 60 })}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-600">{t("broker.afterEventNote")}</p>
        </section>
      )}
    </main>
  );
}
