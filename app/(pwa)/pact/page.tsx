"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem } from "@/storage/local/sync";
import type { Pact } from "@/engine/types";

export default function PactPage() {
  const { t } = useTranslation();
  
  const [activePact, setActivePact] = useState<Pact | null>(null);
  const [pendingPact, setPendingPact] = useState<Pact | null>(null);
  const [nowTime, setNowTime] = useState<number | null>(null);
  
  const [lossLimit, setLossLimit] = useState(5000);
  const [maxTrades, setMaxTrades] = useState(5);
  const [cooldown, setCooldown] = useState(30);
  const [blockBorrowed, setBlockBorrowed] = useState(true);
  const [blockEmergency, setBlockEmergency] = useState(true);

  useEffect(() => {
    setNowTime(Date.now());
    const interval = setInterval(() => setNowTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadPacts() {
      // Load all pacts sorted by effectiveAt desc
      const pacts = await localDatabase.pacts.orderBy("effectiveAt").reverse().toArray();
      const now = new Date().toISOString();
      
      const active = pacts.find(p => p.effectiveAt <= now) || null;
      const pending = pacts.find(p => p.effectiveAt > now) || null;
      
      setActivePact(active);
      setPendingPact(pending);
      
      // If there's a pending pact, prefill with it, otherwise use active, or defaults
      const sourcePact = pending || active;
      if (sourcePact) {
        setLossLimit(sourcePact.dailyLossLimitPaise / 100);
        setMaxTrades(sourcePact.maximumTradesPerDay);
        setCooldown(sourcePact.cooldownAfterLossMinutes);
        setBlockBorrowed(sourcePact.blockBorrowedFunds);
        setBlockEmergency(sourcePact.blockEmergencyFunds);
      }
    }
    loadPacts();
  }, []);

  const handleSave = async () => {
    const nextRevision = activePact ? activePact.revision + 1 : 1;
    
    // Determine if it's tightening or loosening.
    // If any parameter is looser than the active pact, it's delayed by 24h.
    let isLoosening = false;
    
    if (activePact) {
      if (
        (lossLimit * 100) > activePact.dailyLossLimitPaise ||
        maxTrades > activePact.maximumTradesPerDay ||
        cooldown < activePact.cooldownAfterLossMinutes ||
        (!blockBorrowed && activePact.blockBorrowedFunds) ||
        (!blockEmergency && activePact.blockEmergencyFunds)
      ) {
        isLoosening = true;
      }
    }
    
    const effectiveAt = isLoosening 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString();

    const newPact: Pact = {
      id: crypto.randomUUID(),
      dailyLossLimitPaise: lossLimit * 100,
      maximumTradesPerDay: maxTrades,
      cooldownAfterLossMinutes: cooldown,
      blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }], // Default late night 12am to 6am
      blockBorrowedFunds: blockBorrowed,
      blockEmergencyFunds: blockEmergency,
      revision: nextRevision,
      effectiveAt
    };

    await localDatabase.pacts.put(newPact);
    await enqueueSyncItem("pact", newPact, newPact.id);
    alert(isLoosening ? t("pact.loosenDelayed") : t("pact.tightenImmediate"));
    
    // Reload
    const pacts = await localDatabase.pacts.orderBy("effectiveAt").reverse().toArray();
    const now = new Date().toISOString();
    setActivePact(pacts.find(p => p.effectiveAt <= now) || null);
    setPendingPact(pacts.find(p => p.effectiveAt > now) || null);
  };

  const calculateHoursToPending = () => {
    if (!pendingPact || !nowTime) return null;
    const diff = new Date(pendingPact.effectiveAt).getTime() - nowTime;
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  };

  const pendingTime = calculateHoursToPending();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-4 py-8">
      <div className="max-w-md mx-auto w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("pact.title")}</h1>
          <p className="text-gray-500 mt-2">{t("pact.subtitle")}</p>
        </div>

        {pendingPact && pendingTime && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <h3 className="text-sm font-bold text-orange-800 uppercase tracking-wider mb-1">
              {t("pact.pendingLoosen", { hours: pendingTime.hours, minutes: pendingTime.minutes })}
            </h3>
            <p className="text-sm text-orange-700">
              New looser rules are waiting out the 24-hour mandatory delay.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("pact.lossLimitLabel")}</label>
              <input 
                type="number" 
                value={lossLimit} 
                onChange={e => setLossLimit(Number(e.target.value))}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("pact.maxTradesLabel")}</label>
              <input 
                type="number" 
                value={maxTrades} 
                onChange={e => setMaxTrades(Number(e.target.value))}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">{t("pact.cooldownLabel")}</label>
              <input 
                type="number" 
                value={cooldown} 
                onChange={e => setCooldown(Number(e.target.value))}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />
            </div>

            <div className="pt-2 space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={blockBorrowed} 
                  onChange={e => setBlockBorrowed(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="font-medium text-gray-700">{t("pact.blockBorrowedLabel")}</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={blockEmergency} 
                  onChange={e => setBlockEmergency(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="font-medium text-gray-700">{t("pact.blockEmergencyLabel")}</span>
              </label>
            </div>
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button 
              onClick={handleSave}
              className="w-full p-4 bg-gray-900 text-white rounded-xl font-bold shadow-md hover:bg-black transition-colors"
            >
              {t("pact.savePact")}
            </button>
            <p className="text-xs text-center text-gray-500 mt-3">
              {t("pact.tightenImmediate")} {t("pact.loosenDelayed")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
