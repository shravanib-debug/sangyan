"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FifoTrade } from "@/engine/fifo";
import { formatDateTime } from "@/i18n/format";
import { localDatabase } from "@/storage/local/database";
import { importBrokerCsvHistory } from "@/services/import-service";
import type { FlaggedTrade } from "@/services/replay-service";
import { SignalLines } from "@/features/pause/signal-lines";
import { card, primary } from "@/features/app/theme";

export function ImportScreen() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [droppedCount, setDroppedCount] = useState(0);
  const [flaggedTrades, setFlaggedTrades] = useState<FlaggedTrade<FifoTrade>[] | null>(null);
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
          const imported = await importBrokerCsvHistory(text, localDatabase, Date.now());
          setDroppedCount(imported.droppedRows);
          setTotalTrades(imported.trades.length);
          setFlaggedTrades(imported.flaggedTrades.reverse());
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
    <div className="responsive-page space-y-6 pb-12">
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
              {t("importHistory.droppedNotice", { count: droppedCount })}
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
              {t("importHistory.flaggedCount", { flagged: flaggedTrades.length, total: totalTrades })}
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
                        {t(`importHistory.side.${item.trade.side}`)}
                      </span>
                      <span className="ml-2 font-bold">{item.trade.symbol}</span>
                    </div>
                    <span className="text-xs text-gray-500 font-medium">
                      {formatDateTime(item.trade.timestamp, i18n.language)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-600">{t("importHistory.quantity")}:</span> {item.trade.quantity}
                    <span className="mx-2 text-gray-300">|</span> 
                    <span className="font-medium text-gray-600">{t("importHistory.price")}:</span> ₹{(item.trade.pricePaise / 100).toFixed(2)}
                  </div>
                  <div className="mt-3 space-y-1">
                    <SignalLines hits={item.hits} />
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
