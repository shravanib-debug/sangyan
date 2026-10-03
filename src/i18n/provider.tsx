"use client";

import i18n from "i18next";
import type { ReactNode } from "react";
import { initReactI18next, I18nextProvider } from "react-i18next";

import { resources, supportedLocales, type SupportedLocale } from "./resources";

const STORAGE_KEY = "thehrav.locale";

if (!i18n.isInitialized) {
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  const initialLanguage = supportedLocales.includes(stored as SupportedLocale)
    ? (stored as SupportedLocale)
    : "en";

  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: "en",
    supportedLngs: [...supportedLocales],
    interpolation: { escapeValue: false },
    returnNull: false
  });
}

export function setLocale(locale: SupportedLocale) {
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  return i18n.changeLanguage(locale);
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
