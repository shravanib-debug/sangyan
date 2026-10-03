"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { simulateCohorts } from "@/engine/simulator";
import { card, primary } from "@/features/app/theme";

export function SimulatorScreen() {
  const { t } = useTranslation();
  
  const [principal, setPrincipal] = useState(100000);
  const [leverage, setLeverage] = useState(1);
  const [lossLimit, setLossLimit] = useState(5000);
  const [volatility, setVolatility] = useState(0.02);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ baseline: number; ruleBound: number } | null>(null);

  const handleSimulate = () => {
    setBusy(true);
    setResults(null);
    // Defer to allow UI to paint the loading state
    setTimeout(() => {
      const res = simulateCohorts({
        seed: Date.now(),
        numPaths: 2000,
        numSteps: 30, // 30 days
        startPrincipal: principal,
        leverage: leverage,
        mu: 0.0005, // 0.05% daily drift
        sigma: volatility,
        dailyLossLimit: lossLimit
      });
      setResults({
        baseline: res.baselineRuinProb,
        ruleBound: res.ruleBoundRuinProb
      });
      setBusy(false);
    }, 50);
  };

  const lossPercentages = [5, 10, 20, 50, 75, 90, 100];

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header>
        <h1 className="text-2xl font-black">{t("simulator.title")}</h1>
        <p className="text-gray-600 font-medium">{t("simulator.subtitle")}</p>
      </header>
      
      <section className={card}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700">{t("simulator.principal")}</label>
            <input type="number" className="mt-1 block w-full p-3 border-2 border-gray-300 rounded-xl" value={principal} onChange={e => setPrincipal(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">{t("simulator.leverage")}: {leverage}x</label>
            <input type="range" min="1" max="10" step="1" className="mt-1 block w-full accent-blue-600" value={leverage} onChange={e => setLeverage(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">{t("simulator.lossLimit")}</label>
            <input type="number" className="mt-1 block w-full p-3 border-2 border-gray-300 rounded-xl" value={lossLimit} onChange={e => setLossLimit(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700">{t("simulator.volatility")}: {(volatility * 100).toFixed(1)}%</label>
            <input type="range" min="0.005" max="0.1" step="0.005" className="mt-1 block w-full accent-blue-600" value={volatility} onChange={e => setVolatility(Number(e.target.value))} />
          </div>
          <button className={primary} onClick={handleSimulate} disabled={busy}>
            {busy ? "..." : t("simulator.simulate")}
          </button>
        </div>
      </section>

      {results && (
        <section className={card} aria-live="polite">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-gray-600">{t("simulator.baselineRuin")}</p>
              <div className="w-full bg-gray-200 rounded-full h-8 mt-1 overflow-hidden relative">
                <div className="bg-red-500 h-8 transition-all duration-500" style={{ width: `${(results.baseline * 100).toFixed(1)}%` }}></div>
                <span className="absolute inset-0 flex items-center px-4 text-sm font-bold text-gray-900 mix-blend-overlay">
                  {(results.baseline * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600">{t("simulator.ruleBoundRuin")}</p>
              <div className="w-full bg-gray-200 rounded-full h-8 mt-1 overflow-hidden relative">
                <div className="bg-blue-500 h-8 transition-all duration-500" style={{ width: `${(results.ruleBound * 100).toFixed(1)}%` }}></div>
                <span className="absolute inset-0 flex items-center px-4 text-sm font-bold text-gray-900 mix-blend-overlay">
                  {(results.ruleBound * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={card}>
        <h2 className="text-xl font-bold">{t("simulator.recoveryTitle")}</h2>
        <div className="mt-4 space-y-2">
          {lossPercentages.map(loss => {
            if (loss === 100) return <div key={loss} className="p-3 bg-red-50 text-red-700 rounded-xl font-medium text-sm">{t("simulator.recoveryWipeout")}</div>;
            const gain = ((1 / (1 - loss / 100)) - 1) * 100;
            return (
              <div key={loss} className="flex justify-between p-3 bg-gray-50 rounded-xl text-sm font-medium">
                <span>{loss}% Loss</span>
                <span>Requires {gain.toFixed(1)}% Gain</span>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-gray-500 px-2 font-medium">{t("simulator.disclaimer")}</p>
    </div>
  );
}
