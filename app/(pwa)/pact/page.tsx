"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Pact } from "@/engine/types";
import { DEFAULT_BLOCKED_WINDOWS, loadPactState, savePact } from "@/services/pact-service";
import { localDatabase } from "@/storage/local/database";
import { enqueueSyncItem } from "@/storage/local/sync";

const fieldClass =
  "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono";

type SavedKind = "none" | "tighten" | "loosen" | "mixed";

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export default function PactPage() {
  const { t } = useTranslation();

  const [pending, setPending] = useState<Pact | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedKind | null>(null);

  const [lossLimit, setLossLimit] = useState(5000);
  const [maxTrades, setMaxTrades] = useState(5);
  const [cooldown, setCooldown] = useState(30);
  const [blockBorrowed, setBlockBorrowed] = useState(true);
  const [blockEmergency, setBlockEmergency] = useState(true);
  const [maxPosition, setMaxPosition] = useState("");
  const [windows, setWindows] = useState<Pact["blockedWindows"]>(DEFAULT_BLOCKED_WINDOWS);

  const [version, setVersion] = useState(0);

  // Reload on mount and after each save (refilling the form), and tick so the countdown stays current.
  useEffect(() => {
    let cancelled = false;
    async function load(fillForm: boolean) {
      const nowMs = Date.now();
      const state = await loadPactState(localDatabase, nowMs);
      if (cancelled) return;
      setPending(state.pending);
      setNow(nowMs);
      const source = fillForm ? (state.pending ?? state.effective) : null;
      if (source) {
        setLossLimit(source.dailyLossLimitPaise / 100);
        setMaxTrades(source.maximumTradesPerDay);
        setCooldown(source.cooldownAfterLossMinutes);
        setBlockBorrowed(source.blockBorrowedFunds);
        setBlockEmergency(source.blockEmergencyFunds);
        setMaxPosition(source.maxPositionPaise !== undefined ? String(source.maxPositionPaise / 100) : "");
        setWindows(source.blockedWindows);
      }
    }
    void load(true);
    const timer = setInterval(() => void load(false), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [version]);

  const handleSave = async () => {
    const change = await savePact(
      {
        dailyLossLimitRupees: lossLimit,
        maximumTradesPerDay: maxTrades,
        cooldownAfterLossMinutes: cooldown,
        blockBorrowedFunds: blockBorrowed,
        blockEmergencyFunds: blockEmergency,
        maxPositionRupees: maxPosition.trim() === "" ? undefined : Number(maxPosition)
      },
      {
        db: localDatabase,
        now: () => Date.now(),
        newId: () => crypto.randomUUID(),
        enqueue: (entityType, payload, id) => enqueueSyncItem(entityType, payload, id)
      }
    );
    setSaved(change.classification);
    setVersion((value) => value + 1);
  };

  const remaining =
    pending && now !== null ? Math.max(0, new Date(pending.effectiveAt).getTime() - now) : null;
  const hours = remaining === null ? 0 : Math.floor(remaining / 3_600_000);
  const minutes = remaining === null ? 0 : Math.floor((remaining % 3_600_000) / 60_000);

  const savedMessage: Record<SavedKind, string> = {
    none: t("pact.savedNone"),
    tighten: t("pact.savedTighten"),
    loosen: t("pact.savedLoosen"),
    mixed: t("pact.savedMixed")
  };

  return (
    <div className="responsive-page flex flex-col min-h-screen text-gray-900 px-4 py-8">
      <div className="w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("pact.title")}</h1>
          <p className="text-gray-500 mt-2">{t("pact.subtitle")}</p>
        </div>

        {pending && remaining !== null && remaining > 0 && (
          <div className="p-4 bg-orange-50 border border-orange-300 rounded-xl" role="status">
            <h2 className="text-sm font-bold text-orange-900 uppercase tracking-wider mb-1">
              {t("pact.pendingLoosen", { hours, minutes })}
            </h2>
            <p className="text-sm text-orange-900">{t("pact.pendingNote")}</p>
          </div>
        )}

        {saved && (
          <p role="status" className="p-3 bg-green-50 border border-green-300 rounded-xl text-sm text-green-900">
            {savedMessage[saved]}
          </p>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 space-y-5">
            <div>
              <label htmlFor="loss" className="block text-sm font-bold text-gray-700 mb-1">
                {t("pact.lossLimitLabel")}
              </label>
              <input
                id="loss"
                type="number"
                inputMode="numeric"
                min={0}
                value={lossLimit}
                onChange={(e) => setLossLimit(Number(e.target.value))}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="trades" className="block text-sm font-bold text-gray-700 mb-1">
                {t("pact.maxTradesLabel")}
              </label>
              <input
                id="trades"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={maxTrades}
                onChange={(e) => setMaxTrades(Number(e.target.value))}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="cooldown" className="block text-sm font-bold text-gray-700 mb-1">
                {t("pact.cooldownLabel")}
              </label>
              <input
                id="cooldown"
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={cooldown}
                onChange={(e) => setCooldown(Number(e.target.value))}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="max-position" className="block text-sm font-bold text-gray-700 mb-1">
                {t("pact.maxPositionLabel")}
              </label>
              <input
                id="max-position"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t("pact.maxPositionPlaceholder")}
                value={maxPosition}
                onChange={(e) => setMaxPosition(e.target.value)}
                className={fieldClass}
              />
              <p className="text-xs text-gray-500 mt-1">{t("pact.maxPositionHelp")}</p>
            </div>

            {windows.length > 0 && (
              <p className="p-3 bg-orange-50 border border-orange-300 rounded-xl text-sm text-orange-900">
                {t("pact.windowLockNote", {
                  windows: windows.map((w) => `${formatMinute(w.startMinuteIst)}–${formatMinute(w.endMinuteIst)}`).join(", ")
                })}
              </p>
            )}

            <div className="pt-2 space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockBorrowed}
                  onChange={(e) => setBlockBorrowed(e.target.checked)}
                  className="w-6 h-6 rounded border-gray-300"
                />
                <span className="font-medium text-gray-700">{t("pact.blockBorrowedLabel")}</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockEmergency}
                  onChange={(e) => setBlockEmergency(e.target.checked)}
                  className="w-6 h-6 rounded border-gray-300"
                />
                <span className="font-medium text-gray-700">{t("pact.blockEmergencyLabel")}</span>
              </label>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={() => void handleSave()}
              className="w-full p-4 bg-gray-900 text-white rounded-xl font-bold shadow-md hover:bg-black transition-colors"
            >
              {t("pact.savePact")}
            </button>
            <p className="text-xs text-center text-gray-500 mt-3">
              {t("pact.tightenImmediate")} {t("pact.loosenDelayed")}
            </p>
          </div>
        </div>

        <Link
          href="/checkin"
          className="block text-center p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700"
        >
          {t("pact.toCheckin")}
        </Link>
      </div>
    </div>
  );
}
