"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { parseBrokerCsv } from "@/engine/csv-parser";
import { pairFifo, FifoTrade } from "@/engine/fifo";
import { evaluateSignals } from "@/engine/signals";
import { getEffectivePact } from "@/engine/pact";
import { localDatabase } from "@/storage/local/database";
import { SignalHit } from "@/engine/types";
import { card, primary } from "@/features/app/theme";

interface FlaggedTrade {
  trade: FifoTrade;
  hits: SignalHit[];
}

export function ImportScreen() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [droppedCount, setDroppedCount] = useState(0);
  const [flaggedTrades, setFlaggedTrades] = useState<FlaggedTrade[] | null>(null);
  const [totalTrades, setTotalTrades] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        
        setTimeout(async () => {
          const parsed = parseBrokerCsv(text);
          setDroppedCount(parsed.droppedRows);
          
          const trades = pairFifo(parsed.trades);
          setTotalTrades(trades.length);

          const pacts = await localDatabase.pacts.toArray();
          const flags: FlaggedTrade[] = [];
          
          const historySoFar: FifoTrade[] = [];
          
          let pact = getEffectivePact(pacts, Date.now());
          if (!pact) {
            pact = {
              id: "default",
              userId: "local",
              dailyLossLimitPaise: 500000,
              maximumTradesPerDay: 5,
              cooldownAfterLossMinutes: 15,
              blockBorrowedFunds: true,
              blockEmergencyFunds: true,
              blockedWindows: [],
              revision: 1,
              effectiveAt: new Date(0).toISOString()
            };
          }

          for (const trade of trades) {
            historySoFar.push(trade);
            const nowEpochMs = new Date(trade.timestamp).getTime();

            const hits = evaluateSignals({
              pact,
              history: historySoFar,
              nowEpochMs,
              checkIn: undefined
            });

            if (hits.length > 0) {
              flags.push({ trade, hits });
            }
          }
          
          setFlaggedTrades(flags.reverse());
          setBusy(false);
        }, 50);
      } catch (err) {
        console.error(err);
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header>
        <h1 className="text-2xl font-black">{t("importHistory.title")}</h1>
        <p className="text-gray-600 font-medium">{t("importHistory.subtitle")}</p>
      </header>

      <section className={card}>
        <div className="space-y-4">
          <label className={primary + " cursor-pointer block text-center"}>
            {busy ? t("importHistory.processing") : t("importHistory.selectFile")}
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={busy} />
          </label>
          
          {droppedCount > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200 font-medium">
              {t("importHistory.droppedNotice").replace("{{count}}", droppedCount.toString())}
            </p>
          )}
        </div>
      </section>

      {flaggedTrades && (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold">{t("importHistory.replayDiffTitle")}</h2>
            <p className="text-sm text-gray-600">{t("importHistory.replayDiffBody")}</p>
            <p className="mt-2 font-bold text-lg">
              {flaggedTrades.length} / {totalTrades} trades flagged
            </p>
          </div>

          {flaggedTrades.length === 0 ? (
            <div className={card}>
              <p className="text-gray-600 font-medium">{t("importHistory.noFlags")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-bold">{t("importHistory.flaggedTimeline")}</h3>
              {flaggedTrades.map((item, idx) => (
                <div key={idx} className="bg-white border-2 border-red-100 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${item.trade.side === 'buy' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                        {item.trade.side.toUpperCase()}
                      </span>
                      <span className="ml-2 font-bold">{item.trade.symbol}</span>
                    </div>
                    <span className="text-xs text-gray-500 font-medium">
                      {new Date(item.trade.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-600">Qty:</span> {item.trade.quantity} 
                    <span className="mx-2 text-gray-300">|</span> 
                    <span className="font-medium text-gray-600">Price:</span> ₹{(item.trade.pricePaise / 100).toFixed(2)}
                  </div>
                  <div className="mt-3 space-y-1">
                    {item.hits.map((hit, hIdx) => (
                      <div key={hIdx} className="text-xs font-medium text-red-600 flex items-center">
                        <span className="mr-1">⚠️</span> 
                        {hit.signal} 
                        {hit.observedValue !== undefined && ` (Observed: ${hit.observedValue})`}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
