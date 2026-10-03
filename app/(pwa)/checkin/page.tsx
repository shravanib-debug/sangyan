"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem } from "@/storage/local/sync";
import { evaluateRisk } from "@/engine/score";
import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import type { CheckIn, Pact, Trade, WorkerDetectRequest, BorrowKind, FundSource } from "@/engine/types";

export default function CheckinPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [amount, setAmount] = useState<number>(0);
  const [source, setSource] = useState<FundSource>("surplus");
  const [borrowKind, setBorrowKind] = useState<BorrowKind>("none");
  const [horizon, setHorizon] = useState<CheckIn["horizon"]>("intraday");
  const [reason, setReason] = useState("");
  const [exitCondition, setExitCondition] = useState("");

  const [activePact, setActivePact] = useState<Pact | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    async function loadData() {
      const now = new Date().toISOString();
      const pacts = await localDatabase.pacts.orderBy("effectiveAt").reverse().toArray();
      const currentPact = pacts.find(p => p.effectiveAt <= now) || null;
      setActivePact(currentPact);

      // Load trades for the last 24h for evaluation context
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentTrades = await localDatabase.trades
        .where("timestamp")
        .aboveOrEqual(yesterday)
        .toArray();
      setTrades(recentTrades);
    }
    loadData();
  }, []);

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();

    const checkIn: CheckIn = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      amountPaise: amount * 100,
      fundSource: source,
      borrowKind: source === "borrowed" ? borrowKind : "none",
      horizon,
      reason,
      exitCondition
    };

    // Save checkin
    await localDatabase.checkins.put(checkIn);

    // Evaluate Risk
    const request: WorkerDetectRequest = {
      history: trades,
      pact: activePact || {
        id: "default",
        dailyLossLimitPaise: 500000,
        maximumTradesPerDay: 5,
        cooldownAfterLossMinutes: 30,
        blockedWindows: [],
        blockBorrowedFunds: true,
        blockEmergencyFunds: true,
        revision: 1,
        effectiveAt: checkIn.timestamp
      },
      checkIn,
      nowEpochMs: Date.now(),
      config: DEFAULT_ENGINE_CONFIG
    };

    const riskResult = evaluateRisk(request);
    await localDatabase.riskAssessments.put(riskResult);

    await enqueueSyncItem("checkin", checkIn, checkIn.id);
    await enqueueSyncItem("pause", {
      id: crypto.randomUUID(),
      assessmentId: riskResult.assessmentId,
      tier: riskResult.tier,
      startedAt: riskResult.evaluatedAt,
      expiresAt: null, // set by the worker or pause screen if applicable
      outcome: "waiting"
    });

    router.push(`/pause?assessmentId=${riskResult.assessmentId}`);
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
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.amountLabel")}</label>
              <input 
                type="number" 
                value={amount || ''}
                onChange={e => setAmount(Number(e.target.value))}
                required
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.sourceLabel")}</label>
              <select 
                value={source} 
                onChange={e => setSource(e.target.value as FundSource)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="surplus">{t("checkin.sourceSurplus")}</option>
                <option value="savings">{t("checkin.sourceSavings")}</option>
                <option value="emergency_fund">{t("checkin.sourceEmergency")}</option>
                <option value="borrowed">{t("checkin.sourceBorrowed")}</option>
              </select>
            </div>

            {source === "borrowed" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.borrowKindLabel")}</label>
                <select 
                  value={borrowKind} 
                  onChange={e => setBorrowKind(e.target.value as BorrowKind)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                >
                  <option value="bank_loan">Bank Loan</option>
                  <option value="instant_loan">Instant Loan App</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other / Friend</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.horizonLabel")}</label>
              <select 
                value={horizon} 
                onChange={e => setHorizon(e.target.value as CheckIn["horizon"])}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="intraday">{t("checkin.horizonIntraday")}</option>
                <option value="days">{t("checkin.horizonDays")}</option>
                <option value="weeks">{t("checkin.horizonWeeks")}</option>
                <option value="months">{t("checkin.horizonMonths")}</option>
                <option value="years">{t("checkin.horizonYears")}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.reasonLabel")}</label>
              <textarea 
                value={reason} 
                onChange={e => setReason(e.target.value)}
                required
                rows={2}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("checkin.exitLabel")}</label>
              <textarea 
                value={exitCondition} 
                onChange={e => setExitCondition(e.target.value)}
                required
                rows={2}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button 
              type="submit"
              className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
            >
              {t("checkin.evaluateButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
