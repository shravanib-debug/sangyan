"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SignalHit } from "@/engine/types";
import { card, primary } from "@/features/app/theme";
import { SignalLines } from "@/features/pause/signal-lines";
import { loadReview, saveReviewAnswer, type ReviewAnswer, type ReviewData } from "@/services/review-service";
import { formatDateTime } from "@/i18n/format";
import { localDatabase } from "@/storage/local/database";

const RECENT_FLAGGED_LIMIT = 3;

export function PostLossReview() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<ReviewData | null>(null);
  const [failed, setFailed] = useState(false);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await loadReview(localDatabase, Date.now());
        if (!cancelled) setData(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const answer = async (value: ReviewAnswer) => {
    await saveReviewAnswer(localDatabase, value, Date.now());
    setVersion((current) => current + 1);
  };

  const formatTime = (iso: string) => formatDateTime(iso, i18n.language);

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-black">{t("review.title")}</h1>
        <p className="font-medium text-gray-600">{t("review.subtitle")}</p>
      </header>

      {failed && <p className={card}>{t("review.loadFailed")}</p>}
      {!data && !failed && <p className="text-gray-600">{t("review.loading")}</p>}

      {data && data.totalTrades === 0 && data.decisions.length === 0 && (
        <section className={card + " space-y-4"}>
          <h2 className="text-lg font-bold">{t("review.emptyTitle")}</h2>
          <p className="text-gray-700">{t("review.emptyBody")}</p>
          <div className="flex flex-col space-y-2">
            <Link className={primary + " text-center"} href="/import">
              {t("review.emptyImport")}
            </Link>
            <Link className="button secondary text-center" href="/checkin">
              {t("review.emptyCheckin")}
            </Link>
          </div>
        </section>
      )}

      {data && (data.totalTrades > 0 || data.decisions.length > 0) && (
        <>
          <section className={card + " space-y-4"}>
            <p className="text-gray-700">{t("review.intro")}</p>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4">
              <h3 className="font-bold text-blue-800">{t("review.historyTitle")}</h3>
              {data.totalTrades === 0 ? (
                <p className="mt-2 text-sm text-blue-900">{t("review.noTrades")}</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-blue-900 font-medium">
                    {t("review.historySummary", { flagged: data.flagged.length, total: data.totalTrades })}
                  </p>
                  {data.flagged.length === 0 ? (
                    <p className="mt-2 text-sm text-blue-900">{t("review.historyNone")}</p>
                  ) : (
                    <>
                      <ul className="list-disc pl-5 mt-2 space-y-1 text-sm text-blue-900 font-medium">
                        {(Object.entries(data.signalCounts) as [SignalHit["signal"], number][]).map(([signal, count]) => (
                          <li key={signal}>{t("review.signalCount", { name: t(`signalNames.${signal}`), count })}</li>
                        ))}
                      </ul>
                      <h4 className="mt-4 text-sm font-bold text-blue-800">{t("review.recentFlaggedTitle")}</h4>
                      <div className="mt-2 space-y-3">
                        {data.flagged.slice(-RECENT_FLAGGED_LIMIT).reverse().map((item) => (
                          <div key={item.trade.id} className="text-sm text-blue-900">
                            <p className="font-medium">
                              {item.trade.symbol} · {formatTime(item.trade.timestamp)}
                            </p>
                            <SignalLines hits={item.hits} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </section>

          <section className={card + " space-y-3"}>
            <h3 className="font-bold">{t("review.decisionsTitle")}</h3>
            {data.decisions.length === 0 ? (
              <p className="text-sm text-gray-600">{t("review.decisionsNone")}</p>
            ) : (
              data.decisions.map(({ checkIn, tier, outcome }) => (
                <div key={checkIn.id} className="rounded-lg border border-gray-200 p-3 text-sm space-y-1">
                  <p className="text-xs text-gray-500 font-medium">{formatTime(checkIn.timestamp)}</p>
                  <p>
                    <span className="font-bold">{t("review.reasonLabel")}:</span> {checkIn.reason}
                  </p>
                  <p>
                    <span className="font-bold">{t("review.exitLabel")}:</span> {checkIn.exitCondition}
                  </p>
                  <p className="text-gray-600">
                    {t(`signal.sourceName.${checkIn.fundSource}`)}
                    {tier && ` · ${t("review.tierLabel", { level: tier.slice(1) })}`}
                    {outcome && ` · ${t(`review.outcome.${outcome}`)}`}
                  </p>
                </div>
              ))
            )}
          </section>

          <section className={card + " space-y-4"}>
            <h3 className="font-bold">{t("review.reflectTitle")}</h3>
            <p className="text-sm text-gray-600">{t("review.reflectQuestion")}</p>

            <div className="flex flex-col space-y-2 mt-4">
              <button className={primary + " w-full"} onClick={() => void answer("followed")}>
                {t("review.followed")}
              </button>
              <button className="button secondary w-full" onClick={() => void answer("breached")}>
                {t("review.breached")}
              </button>
            </div>
            {data.lastAnswer && (
              <p className="text-sm text-gray-700" aria-live="polite">
                {t(`review.saved.${data.lastAnswer.answer}`, { time: formatTime(data.lastAnswer.answeredAt) })}
              </p>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-gray-400 text-center mt-4">{t("review.privacy")}</p>
    </div>
  );
}
