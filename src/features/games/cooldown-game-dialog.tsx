"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { RunnerGame } from "./runner-game";

/**
 * A pop-up with the offline runner game, for passing a cooling-off pause without staring
 * at a timer. Closes with the × button or Escape and returns focus to what opened it.
 */
export function CooldownGameDialog({ onClose, pauseNote }: Readonly<{ onClose: () => void; pauseNote?: string }>) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  // The parent re-renders often (the demo feed ticks), so keep the latest handler in a ref
  // rather than re-running the setup below, which would steal focus on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cooldown-game-title"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl p-5 sm:p-6"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("game.close")}
          className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-full text-2xl leading-none text-gray-700 hover:bg-gray-100"
        >
          ×
        </button>
        <h2 id="cooldown-game-title" className="text-xl font-bold pr-10">
          {t("game.title")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-600">{pauseNote ?? t("game.subtitle")}</p>
        <RunnerGame />
      </section>
    </div>
  );
}
