"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

import type { BorrowKind, CheckIn, CheckInTrigger, ExitPlan, FundSource } from "@/engine/types";
import { refreshBrokerHistory } from "@/services/broker-history";
import { runCheckIn } from "@/services/checkin-service";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem, isSyncEnabled } from "@/storage/local/sync";

const EXIT_PLANS: ExitPlan[] = ["price_level", "loss_percent", "time", "undecided"];
const TRIGGERS: CheckInTrigger[] = ["own_research", "planned", "tip", "recover_loss", "fomo"];

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

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
  const [exitPlan, setExitPlan] = useState<ExitPlan | null>(null);
  const [triggers, setTriggers] = useState<CheckInTrigger[]>([]);
  const [emergencyFund, setEmergencyFund] = useState("");
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [loanRate, setLoanRate] = useState("");
  const [loanYears, setLoanYears] = useState("");

  // Best-effort: bring the user's own recent broker fills into local history. A check-in never waits for it.
  useEffect(() => {
    void refreshBrokerHistory(localDatabase, { syncEnabled: isSyncEnabled });
  }, []);

  const toggleTrigger = (trigger: CheckInTrigger) =>
    setTriggers((current) => (current.includes(trigger) ? current.filter((item) => item !== trigger) : [...current, trigger]));
  const choicesMissing = !exitPlan || triggers.length === 0;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleEvaluate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!exitPlan || triggers.length === 0) {
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const outcome = await runCheckIn(
        {
          amountRupees: amount,
          source,
          borrowKind,
          horizon,
          reason,
          exitCondition,
          exitPlan,
          triggers,
          emergencyFundRupees: optionalNumber(emergencyFund),
          monthlyExpensesRupees: optionalNumber(monthlyExpenses),
          loanAnnualRatePercent: optionalNumber(loanRate),
          loanYears: optionalNumber(loanYears)
        },
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
    <div className="responsive-page narrow flex flex-col min-h-screen text-gray-900 px-4 py-8">
      <div className="w-full space-y-6">
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
                <p className="text-xs text-gray-500 mt-3">{t("checkin.optionalFiguresNote")}</p>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label htmlFor="loanRate" className="block text-sm font-bold text-gray-700 mb-1">
                      {t("checkin.loanRateLabel")}
                    </label>
                    <input id="loanRate" type="number" inputMode="decimal" min={0} value={loanRate} onChange={(e) => setLoanRate(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="loanYears" className="block text-sm font-bold text-gray-700 mb-1">
                      {t("checkin.loanYearsLabel")}
                    </label>
                    <input id="loanYears" type="number" inputMode="decimal" min={0} value={loanYears} onChange={(e) => setLoanYears(e.target.value)} className={fieldClass} />
                  </div>
                </div>
              </div>
            )}

            {source === "emergency_fund" && (
              <div>
                <p className="text-xs text-gray-500">{t("checkin.optionalFiguresNote")}</p>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label htmlFor="emergencyFund" className="block text-sm font-bold text-gray-700 mb-1">
                      {t("checkin.emergencyFundLabel")}
                    </label>
                    <input id="emergencyFund" type="number" inputMode="decimal" min={0} value={emergencyFund} onChange={(e) => setEmergencyFund(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="monthlyExpenses" className="block text-sm font-bold text-gray-700 mb-1">
                      {t("checkin.monthlyExpensesLabel")}
                    </label>
                    <input id="monthlyExpenses" type="number" inputMode="decimal" min={0} value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(e.target.value)} className={fieldClass} />
                  </div>
                </div>
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

            <fieldset>
              <legend className="block text-sm font-bold text-gray-700 mb-2">{t("checkin.triggersLabel")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRIGGERS.map((item) => (
                  <label key={item} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={triggers.includes(item)} onChange={() => toggleTrigger(item)} className="w-5 h-5" />
                    <span>{t(`checkin.trigger.${item}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="block text-sm font-bold text-gray-700 mb-2">{t("checkin.exitPlanLabel")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXIT_PLANS.map((item) => (
                  <label key={item} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer">
                    <input type="radio" name="exitPlan" checked={exitPlan === item} onChange={() => setExitPlan(item)} className="w-5 h-5" />
                    <span>{t(`checkin.exitPlan.${item}`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

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
                {choicesMissing ? t("checkin.choicesRequired") : t("common.error")}
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
