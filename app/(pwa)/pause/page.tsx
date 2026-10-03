"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { localDatabase } from "@/storage/local/database";
import type { RiskResult, PauseEvent, RiskTier } from "@/engine/types";

export default function PausePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assessmentId = searchParams?.get("assessmentId");

  const [assessment, setAssessment] = useState<RiskResult | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLocked, setIsLocked] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    async function loadAssessment() {
      if (!assessmentId) return;
      const data = await localDatabase.riskAssessments.get(assessmentId);
      if (data) {
        setAssessment(data);
        
        let seconds = 0;
        if (data.tier === "L1") seconds = 10;
        if (data.tier === "L2") seconds = 120;
        
        setTimeLeft(seconds);
        
        if (data.tier === "L3") {
          setIsLocked(true);
        }

        // Record pause event start
        if (!hasStarted) {
          const pause: PauseEvent = {
            id: crypto.randomUUID(),
            assessmentId: data.assessmentId,
            tier: data.tier,
            startedAt: new Date().toISOString(),
            outcome: "waiting"
          };
          await localDatabase.pauses.put(pause);
          setHasStarted(true);
        }
      }
    }
    loadAssessment();
  }, [assessmentId, hasStarted]);

  useEffect(() => {
    if (timeLeft > 0 && !isLocked) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, isLocked]);

  const handleOutcome = async (outcome: "continued" | "abandoned") => {
    if (assessment) {
      // Find the pause event and update outcome
      const pauses = await localDatabase.pauses
        .where("assessmentId")
        .equals(assessment.assessmentId)
        .toArray();
      
      if (pauses.length > 0) {
        await localDatabase.pauses.update(pauses[0]!.id, { outcome });
      }
    }
    
    // Redirect based on outcome
    if (outcome === "abandoned") {
      router.push("/");
    } else {
      router.push("/"); // Proceeding is outside our app (user goes back to broker)
    }
  };

  if (!assessment) {
    return <div className="p-8 text-center">Loading evaluation...</div>;
  }

  const getTierMessage = (tier: RiskTier) => {
    switch (tier) {
      case "L0": return t("pause.l0");
      case "L1": return t("pause.l1");
      case "L2": return t("pause.l2");
      case "L3": return t("pause.l3");
    }
  };

  const getTierColor = (tier: RiskTier) => {
    switch (tier) {
      case "L0": return "bg-green-100 text-green-800 border-green-200";
      case "L1": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "L2": return "bg-orange-100 text-orange-800 border-orange-200";
      case "L3": return "bg-red-100 text-red-800 border-red-200";
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{t("pause.title")}</h1>
        </div>

        <div className={`p-6 rounded-2xl border ${getTierColor(assessment.tier)} text-center`}>
          <div className="text-xl font-bold mb-2">{getTierMessage(assessment.tier)}</div>
          
          {assessment.tier !== "L0" && (
            <div className="mt-4 text-left">
              <h4 className="font-bold mb-2">{t("pause.explanationTitle")}</h4>
              <ul className="list-disc pl-5 space-y-1">
                {assessment.signalHits.map((hit, i) => (
                  <li key={i} className="text-sm">
                    {hit.signal.replace('_', ' ')} detected (contribution: {(hit.contribution * 100).toFixed(0)}%)
                  </li>
                ))}
                {assessment.hardRuleOverrides.map((rule, i) => (
                  <li key={`hr-${i}`} className="text-sm font-bold">
                    Hard rule applied: {rule.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4 pt-6">
          {isLocked ? (
            <div className="p-4 bg-gray-200 text-gray-800 text-center rounded-xl font-bold">
              {t("pause.lock")}
            </div>
          ) : timeLeft > 0 ? (
            <div className="p-4 bg-gray-200 text-gray-800 text-center rounded-xl font-bold tabular-nums">
              {t("pause.timer", { seconds: timeLeft })}
            </div>
          ) : (
            <button
              onClick={() => handleOutcome("continued")}
              className="w-full p-4 bg-white border-2 border-gray-300 text-gray-800 rounded-xl font-bold hover:bg-gray-50 transition-colors"
            >
              {t("pause.continue")}
            </button>
          )}

          <button
            onClick={() => handleOutcome("abandoned")}
            className="w-full p-4 bg-gray-900 text-white rounded-xl font-bold shadow-md hover:bg-black transition-colors"
          >
            {t("pause.abandon")}
          </button>
        </div>

      </div>
    </div>
  );
}
