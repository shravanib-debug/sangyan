"use client";

import i18n from "i18next";
import { useEffect, type ReactNode } from "react";
import { initReactI18next, I18nextProvider } from "react-i18next";

import { resources, supportedLocales, type SupportedLocale } from "./resources";

const STORAGE_KEY = "thehrav.locale";

// The server cannot read localStorage, so the server render and the first client render both use
// English. The stored locale is applied right after hydration; until then the layout's inline script
// keeps the page hidden (data-locale-pending) so a Hindi or Marathi user never sees an English flash.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: [...supportedLocales],
    interpolation: { escapeValue: false },
    returnNull: false
  });
}

function readStoredLocale(): SupportedLocale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return supportedLocales.includes(stored as SupportedLocale) ? (stored as SupportedLocale) : "en";
  } catch {
    return "en";
  }
}

export function setLocale(locale: SupportedLocale) {
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  return i18n.changeLanguage(locale);
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const locale = readStoredLocale();
    let cancelled = false;
    void i18n.changeLanguage(locale).then(() => {
      if (cancelled) return;
      document.documentElement.lang = locale;
      // Two frames: let React paint the translated tree before the page is revealed.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.documentElement.removeAttribute("data-locale-pending"))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
