"use client";

import { useTranslation } from "react-i18next";

import type { RiskResult, SignalHit } from "@/engine/types";

import { describeHit } from "./describe-hit";

const UNIT_BY_CODE: Record<string, "minutes" | "trades" | "times"> = {
  "signal.revenge.triggered": "minutes",
  "signal.breach.cooldown": "minutes",
  "signal.overtrade.triggered": "trades",
  "signal.breach.max_trades": "trades",
  "signal.loss_hold.triggered": "times"
};

/** One localized line per signal: its name and the observed value, with its unit, against the threshold from the user's own rules. */
export function SignalLines({ hits }: Readonly<{ hits: readonly SignalHit[] }>) {
  const { t } = useTranslation();
  return (
    <>
      {hits.map((hit, index) => {
        const description = describeHit(hit);
        const unit = UNIT_BY_CODE[hit.explanationCode];
        const withUnit = (value: string) => (unit ? t(`units.${unit}`, { value }) : value);
        const observed = description.observedKey ? t(description.observedKey) : withUnit(description.params.observed);
        const threshold = description.thresholdKey ? t(description.thresholdKey) : withUnit(description.params.threshold);
        return (
          <div key={index} className="text-xs font-medium text-red-600">
            <span className="font-bold">{t(`signalNames.${hit.signal}`)}</span>
            {": "}
            {t("signalLine", { observed, threshold })}
          </div>
        );
      })}
    </>
  );
}

/** The full stored explanation of an assessment: every signal sentence plus any hard-rule override. */
export function AssessmentExplanation({ assessment }: Readonly<{ assessment: RiskResult }>) {
  const { t } = useTranslation();
  if (assessment.signalHits.length === 0 && assessment.hardRuleOverrides.length === 0) {
    return <p className="text-sm text-gray-600">{t("journal.noSignals")}</p>;
  }
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm">
      {assessment.signalHits.map((hit) => {
        const description = describeHit(hit);
        const params = {
          ...description.params,
          observed: description.observedKey ? t(description.observedKey) : description.params.observed,
          threshold: description.thresholdKey ? t(description.thresholdKey) : description.params.threshold
        };
        return <li key={hit.explanationCode}>{t(description.key, params)}</li>;
      })}
      {assessment.hardRuleOverrides.map((rule) => (
        <li key={rule} className="font-semibold">
          {t(`pause.override.${rule}`)}
        </li>
      ))}
    </ul>
  );
}
