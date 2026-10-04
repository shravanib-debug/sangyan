"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CheckIn } from "@/engine/types";
import { card, primary } from "@/features/app/theme";
import { AssessmentExplanation, SignalLines } from "@/features/pause/signal-lines";
import { formatDateTime } from "@/i18n/format";
import { loadJournal, type JournalData, type JournalItem } from "@/services/journal-service";
import { localDatabase } from "@/storage/local/database";

const PAGE_SIZE = 20;

const HORIZON_KEY: Record<CheckIn["horizon"], string> = {
  intraday: "checkin.horizonIntraday",
  days: "checkin.horizonDays",
  weeks: "checkin.horizonWeeks",
  months: "checkin.horizonMonths",
  years: "checkin.horizonYears"
};

export function JournalScreen() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<JournalData | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await loadJournal(localDatabase, Date.now());
        if (!cancelled) setData(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatTime = (iso: string) => formatDateTime(iso, i18n.language);
  const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

  const renderItem = (item: JournalItem) => {
    if (item.kind === "checkin") {
      const { checkIn, assessment, tier, outcome } = item.record;
      return (
        <article key={`c-${checkIn.id}`} className={card + " space-y-2 text-sm"}>
          <p className="text-xs text-gray-500 font-medium">
            {formatTime(checkIn.timestamp)} · {t("journal.kindCheckin")}
          </p>
          <p>
            <span className="font-bold">{t("checkin.amountLabel")}:</span> {rupees(checkIn.amountPaise)}
          </p>
          <p>
            <span className="font-bold">{t("checkin.sourceLabel")}:</span> {t(`signal.sourceName.${checkIn.fundSource}`)}
          </p>
          <p>
            <span className="font-bold">{t("checkin.horizonLabel")}:</span> {t(HORIZON_KEY[checkIn.horizon])}
          </p>
          <p>
            <span className="font-bold">{t("review.reasonLabel")}:</span> {checkIn.reason}
          </p>
          <p>
            <span className="font-bold">{t("review.exitLabel")}:</span> {checkIn.exitCondition}
          </p>
          {assessment && (
            <>
              <p>
                <span className="font-bold">{t("journal.riskLabel")}:</span>{" "}
                {t("pause.scoreLine", { score: Math.round(assessment.score * 100) })}
                {tier && ` · ${t("review.tierLabel", { level: tier.slice(1) })}`}
              </p>
              <div>
                <p className="font-bold">{t("journal.signalsLabel")}:</p>
                <AssessmentExplanation assessment={assessment} />
              </div>
            </>
          )}
          {outcome && (
            <p>
              <span className="font-bold">{t("journal.outcomeLabel")}:</span> {t(`review.outcome.${outcome}`)}
            </p>
          )}
        </article>
      );
    }

    const { trade, hits } = item.flagged;
    return (
      <article key={`t-${trade.id}`} className={card + " space-y-2 text-sm"}>
        <p className="text-xs text-gray-500 font-medium">
          {formatTime(trade.timestamp)} · {t("journal.kindTrade")}
        </p>
        <p>
          <span className="font-bold">{t(`importHistory.side.${trade.side}`)}</span> {trade.symbol} ·{" "}
          {t("importHistory.quantity")}: {trade.quantity} · {t("importHistory.price")}: ₹{(trade.pricePaise / 100).toFixed(2)}
        </p>
        <div>
          <p className="font-bold">{t("journal.signalsLabel")}:</p>
          <SignalLines hits={hits} />
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-black">{t("screens.journal")}</h1>
        <p className="font-medium text-gray-600">{t("journal.subtitle")}</p>
      </header>

      {failed && <p className={card}>{t("journal.loadFailed")}</p>}
      {!data && !failed && <p className="text-gray-600">{t("journal.loading")}</p>}

      {data && data.items.length === 0 && (
        <section className={card + " space-y-4"}>
          <h2 className="text-lg font-bold">{t("journal.emptyTitle")}</h2>
          <p className="text-gray-700">{t("journal.emptyBody")}</p>
          <div className="flex flex-col space-y-2">
            <Link className={primary + " text-center"} href="/checkin">
              {t("review.emptyCheckin")}
            </Link>
            <Link className="button secondary text-center" href="/import">
              {t("review.emptyImport")}
            </Link>
          </div>
        </section>
      )}

      {data && data.lastAnswer && (
        <section className={card + " space-y-1 text-sm"}>
          <h2 className="font-bold">{t("journal.reflectionTitle")}</h2>
          <p>{t(`review.saved.${data.lastAnswer.answer}`, { time: formatTime(data.lastAnswer.answeredAt) })}</p>
        </section>
      )}

      {data && data.items.length > 0 && (
        <section className="space-y-4">
          {data.items.slice(0, visible).map(renderItem)}
          {visible < data.items.length && (
            <button className="button secondary w-full" onClick={() => setVisible((current) => current + PAGE_SIZE)}>
              {t("journal.showMore", { remaining: data.items.length - visible })}
            </button>
          )}
        </section>
      )}

      <p className="text-xs text-gray-400 text-center mt-4">{t("journal.privacy")}</p>
    </div>
  );
}
