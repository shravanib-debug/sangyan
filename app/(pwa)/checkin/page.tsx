"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

import type { BorrowKind, CheckIn, FundSource } from "@/engine/types";
import { runCheckIn } from "@/services/checkin-service";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem } from "@/storage/local/sync";

const fieldClass =
  "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all";

export default function CheckinPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [amount, setAmount] = useState<number>(0);
  const [source, setSource] = useState<FundSource>("surplus");
  const [borrowKind, setBorrowKind] = useState<BorrowKind>("bank_loan");
  const [horizon, setHorizon] = useState<CheckIn["horizon"]>("intraday");
  const [reason, setReason] = useState("");
  const [exitCondition, setExitCondition] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleEvaluate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const outcome = await runCheckIn(
        { amountRupees: amount, source, borrowKind, horizon, reason, exitCondition },
        {
          db: localDatabase,
          now: () => Date.now(),
          newId: () => crypto.randomUUID(),
          enqueue: (entityType, payload, id) => enqueueSyncItem(entityType, payload, id)
        }
      );
      router.push(`/pause?pauseId=${outcome.pauseId}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-4 py-8">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("checkin.title")}</h1>
          <p className="text-gray-500 mt-2">{t("checkin.subtitle")}</p>
        </div>

        <form onSubmit={handleEvaluate} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 space-y-5">
            <div>
              <label htmlFor="amount" className="block text-sm font-bold text-gray-700 mb-1">
                {t("checkin.amountLabel")}
              </label>
              <input
                id="amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className={`${fieldClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="source" className="block text-sm font-bold text-gray-700 mb-1">
                {t("checkin.sourceLabel")}
              </label>
              <select id="source" value={source} onChange={(e) => setSource(e.target.value as FundSource)} className={fieldClass}>
                <option value="surplus">{t("checkin.sourceSurplus")}</option>
                <option value="savings">{t("checkin.sourceSavings")}</option>
                <option value="emergency_fund">{t("checkin.sourceEmergency")}</option>
                <option value="borrowed">{t("checkin.sourceBorrowed")}</option>
              </select>
            </div>

            {source === "borrowed" && (
              <div>
                <label htmlFor="borrowKind" className="block text-sm font-bold text-gray-700 mb-1">
                  {t("checkin.borrowKindLabel")}
                </label>
                <select
                  id="borrowKind"
                  value={borrowKind}
                  onChange={(e) => setBorrowKind(e.target.value as BorrowKind)}
                  className={fieldClass}
                >
                  <option value="bank_loan">{t("checkin.borrowBank")}</option>
                  <option value="instant_loan">{t("checkin.borrowInstant")}</option>
                  <option value="credit_card">{t("checkin.borrowCard")}</option>
                  <option value="other">{t("checkin.borrowOther")}</option>
                </select>
              </div>
            )}

            <div>
              <label htmlFor="horizon" className="block text-sm font-bold text-gray-700 mb-1">
                {t("checkin.horizonLabel")}
              </label>
              <select
                id="horizon"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as CheckIn["horizon"])}
                className={fieldClass}
              >
                <option value="intraday">{t("checkin.horizonIntraday")}</option>
                <option value="days">{t("checkin.horizonDays")}</option>
                <option value="weeks">{t("checkin.horizonWeeks")}</option>
                <option value="months">{t("checkin.horizonMonths")}</option>
                <option value="years">{t("checkin.horizonYears")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-bold text-gray-700 mb-1">
                {t("checkin.reasonLabel")}
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={1000}
                rows={2}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="exit" className="block text-sm font-bold text-gray-700 mb-1">
                {t("checkin.exitLabel")}
              </label>
              <textarea
                id="exit"
                value={exitCondition}
                onChange={(e) => setExitCondition(e.target.value)}
                required
                maxLength={500}
                rows={2}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-100 space-y-3">
            {failed && (
              <p role="alert" className="text-sm text-red-700">
                {t("common.error")}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {t("checkin.evaluateButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
