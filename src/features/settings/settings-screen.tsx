"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAccountState } from "@/features/account/use-account-state";
import { disablePush, enablePush, hasPushSubscription, pushSupport } from "@/services/push-service";
import { formatDateTime } from "@/i18n/format";
import { localDatabase } from "@/storage/local/database";
import { isSyncEnabled, setSyncEnabled } from "@/storage/local/sync";

const NOTICE_CODES = [
  "consent_required",
  "replay",
  "connected",
  "denied",
  "state_invalid",
  "state_replayed",
  "exchange_failed",
  "connect_failed",
  "not_configured"
] as const;

const card = "bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4";
const primary = "w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-60";
const secondary = "w-full p-4 bg-white border-2 border-gray-300 text-gray-900 rounded-xl font-bold hover:bg-gray-50 disabled:opacity-60";

async function setConsent(purpose: string, granted: boolean): Promise<boolean> {
  const response = await fetch("/api/consents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, granted })
  });
  return response.ok;
}

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { state, reachable, reload } = useAccountState();
  const notice = useSearchParams()?.get("broker") ?? null;
  const router = useRouter();

  const [localSync, setLocalSync] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sync, push] = await Promise.all([isSyncEnabled(), hasPushSubscription(localDatabase.settings)]);
      if (!cancelled) {
        setLocalSync(sync);
        setPushOn(push);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch {
      setMessage(t("common.error"));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const signedIn = Boolean(state?.user);
  const syncOn = Boolean(state?.consents.sync) && localSync;
  const brokerStatus = state?.broker.status ?? "disconnected";
  const brokerActive = brokerStatus !== "disconnected";

  const toggleSync = () =>
    run(async () => {
      const next = !syncOn;
      if (!(await setConsent("sync", next))) throw new Error("consent");
      await setSyncEnabled(next);
      setLocalSync(next);
    });

  const toggleJournalSync = (granted: boolean) =>
    run(async () => {
      if (!(await setConsent("journal_sync", granted))) throw new Error("consent");
    });

  const connectBroker = () =>
    run(async () => {
      if (!(await setConsent("broker_monitoring", true))) throw new Error("consent");
      // A full navigation: the connect route redirects to Zerodha's hosted login.
      window.open("/api/brokers/zerodha/connect", "_self");
    });

  const disconnectBroker = () =>
    run(async () => {
      const response = await fetch("/api/brokers/zerodha/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("disconnect");
      setAgreed(false);
    });

  const togglePush = () =>
    run(async () => {
      if (pushOn) {
        await disablePush(localDatabase.settings);
        await setConsent("push", false);
        setPushOn(false);
        return;
      }
      if (pushSupport() === "unsupported") return setMessage(t("settings.pushUnsupported"));
      if (!state?.config.vapidPublicKey) return setMessage(t("settings.notices.not_configured"));
      if (!(await setConsent("push", true))) throw new Error("consent");
      const enabled = await enablePush(state.config.vapidPublicKey, localDatabase.settings);
      if (!enabled) {
        await setConsent("push", false);
        setMessage(pushSupport() === "denied" ? t("settings.pushDenied") : t("common.error"));
        return;
      }
      setPushOn(true);
    });

  const handleExport = () =>
    run(async () => {
      const { exportLocalData } = await import("@/storage/local/database");
      const data = await exportLocalData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thehrav-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const handleDeleteLocal = () => {
    if (!window.confirm(t("settings.deleteLocalConfirm"))) return;
    run(async () => {
      const { clearLocalData } = await import("@/storage/local/database");
      await clearLocalData();
      router.replace("/");
      router.refresh();
    });
  };

  const handleDeleteAccount = () => {
    if (!window.confirm(t("settings.deleteAccountConfirm"))) return;
    run(async () => {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (!response.ok) throw new Error("delete");
      const { clearLocalData } = await import("@/storage/local/database");
      await clearLocalData();
      router.replace("/");
      router.refresh();
    });
  };

  const noticeText =
    notice && (NOTICE_CODES as readonly string[]).includes(notice)
      ? t(`settings.notices.${notice}` as "settings.notices.connected")
      : null;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-6 py-12">
      <div className="max-w-md mx-auto w-full space-y-6">
        <h1 className="text-3xl font-bold">{t("settings.title")}</h1>

        {!reachable && (
          <p role="status" className="p-3 bg-yellow-50 border border-yellow-300 rounded-xl text-sm">
            {t("settings.offlineNote")}
          </p>
        )}
        {noticeText && (
          <p role="status" className="p-3 bg-blue-50 border border-blue-300 rounded-xl text-sm">
            {noticeText}
          </p>
        )}
        {message && (
          <p role="alert" className="p-3 bg-red-50 border border-red-300 rounded-xl text-sm">
            {message}
          </p>
        )}

        <section className={card} aria-labelledby="account-title">
          <h2 id="account-title" className="text-xl font-bold">
            {t("settings.accountTitle")}
          </h2>
          {signedIn ? (
            <p>{t("home.signedInAs", { email: state?.user?.email ?? "" })}</p>
          ) : (
            <>
              <p className="text-gray-600">{t("settings.signedOut")}</p>
              <Link href="/login" className="block text-center p-4 bg-blue-600 text-white rounded-xl font-bold">
                {t("settings.signIn")}
              </Link>
            </>
          )}
        </section>

        {signedIn && (
          <section className={card} aria-labelledby="sync-title">
            <h2 id="sync-title" className="text-xl font-bold">
              {t("settings.syncTitle")}
            </h2>
            <p className="text-gray-600">{t("settings.syncBody")}</p>
            {syncOn && <p className="font-medium">{t("settings.syncOn")}</p>}
            <button className={syncOn ? secondary : primary} disabled={busy} onClick={() => void toggleSync()}>
              {syncOn ? t("settings.syncDisable") : t("settings.syncEnable")}
            </button>
            {syncOn && (
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  className="w-6 h-6"
                  checked={Boolean(state?.consents.journal_sync)}
                  disabled={busy}
                  onChange={(event) => void toggleJournalSync(event.target.checked)}
                />
                <span>{t("settings.journalSyncLabel")}</span>
              </label>
            )}
          </section>
        )}

        <section className={card} aria-labelledby="broker-title">
          <h2 id="broker-title" className="text-xl font-bold">
            {t("settings.brokerTitle")}
          </h2>
          <p className="text-gray-600">{t("settings.brokerBody")}</p>
          <p className="text-sm">{t("common.limitation")}</p>

          <div className="flex items-center space-x-3" role="status">
            <span
              aria-hidden="true"
              className={`w-3 h-3 rounded-full ${brokerStatus === "live" ? "bg-green-600" : brokerStatus === "disconnected" ? "bg-gray-400" : "bg-orange-500"}`}
            />
            <span className="font-medium">{t(`settings.status.${brokerStatus}` as "settings.status.live")}</span>
          </div>
          {brokerActive && state?.broker.simulated && (
            <p className="p-3 bg-blue-50 border border-blue-300 rounded-xl text-sm">{t("settings.brokerSimulated")}</p>
          )}
          {brokerActive && state?.broker.expiresAt && (
            <p className="text-sm text-gray-600">
              {t("settings.brokerExpires", { time: formatDateTime(state.broker.expiresAt, i18n.language) })}
            </p>
          )}

          {!signedIn ? (
            <p className="text-sm">{t("settings.brokerSignInFirst")}</p>
          ) : brokerActive ? (
            <button className={secondary} disabled={busy} onClick={() => void disconnectBroker()}>
              {t("settings.brokerDisconnect")}
            </button>
          ) : (
            <>
              <label className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  className="w-6 h-6 mt-1"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span className="text-sm">{t("settings.brokerConsent")}</span>
              </label>
              <button className={primary} disabled={busy || !agreed} onClick={() => void connectBroker()}>
                {t("settings.brokerConnect")}
              </button>
            </>
          )}
        </section>

        {signedIn && (
          <section className={card} aria-labelledby="push-title">
            <h2 id="push-title" className="text-xl font-bold">
              {t("settings.pushTitle")}
            </h2>
            <p className="text-gray-600">{t("settings.pushBody")}</p>
            {pushOn && <p className="font-medium">{t("settings.pushOn")}</p>}
            <button className={pushOn ? secondary : primary} disabled={busy} onClick={() => void togglePush()}>
              {pushOn ? t("settings.pushDisable") : t("settings.pushEnable")}
            </button>
          </section>
        )}

        <section className={card} aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="text-xl font-bold text-red-600">
            {t("settings.privacyTitle")}
          </h2>
          <p className="text-gray-600">{t("settings.privacyBody")}</p>
          <div className="space-y-3 pt-2">
            <button
              className="w-full p-4 bg-white border-2 border-gray-300 text-gray-900 rounded-xl font-bold hover:bg-gray-50 disabled:opacity-60"
              disabled={busy}
              onClick={() => void handleExport()}
            >
              {t("settings.exportData")}
            </button>
            <button
              className="w-full p-4 bg-white border-2 border-red-300 text-red-600 rounded-xl font-bold hover:bg-red-50 disabled:opacity-60"
              disabled={busy}
              onClick={() => void handleDeleteLocal()}
            >
              {t("settings.deleteLocal")}
            </button>
            {signedIn && (
              <button
                className="w-full p-4 bg-red-600 text-white rounded-xl font-bold shadow-md hover:bg-red-700 disabled:opacity-60"
                disabled={busy}
                onClick={() => void handleDeleteAccount()}
              >
                {t("settings.deleteAccount")}
              </button>
            )}
          </div>
        </section>

        <Link href="/home" className="block text-center underline">
          {t("common.backHome")}
        </Link>
      </div>
    </div>
  );
}
