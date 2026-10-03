"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const subscribeOnline = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

const getOnlineSnapshot = () => (typeof navigator !== "undefined" ? navigator.onLine : true);
const getServerOnlineSnapshot = () => true;

export function PwaBootstrap() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const onControllerChange = () => {
      if (!pathname.startsWith("/pause")) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
  }, [pathname]);

  const applyUpdate = () => {
    if (pathname.startsWith("/pause")) return;
    waiting?.postMessage({ type: "SKIP_WAITING" });
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <>
      {!online ? (
        <div className="status-banner" role="status">
          {t("common.offline")}
        </div>
      ) : null}
      {waiting ? (
        <div className="status-banner" role="status">
          {t("common.updateReady")} {" "}
          <button className="button secondary" disabled={pathname.startsWith("/pause")} onClick={applyUpdate}>
            {t("common.updateNow")}
          </button>
        </div>
      ) : null}
      {installPrompt ? (
        <div className="status-banner" role="status">
          <button className="button secondary" onClick={() => void install()}>
            {t("common.install")}
          </button>
        </div>
      ) : null}
    </>
  );
}
