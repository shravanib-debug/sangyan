"use client";

import { useTranslation } from "react-i18next";

import { setLocale } from "@/i18n/provider";
import { supportedLocales, type SupportedLocale } from "@/i18n/resources";

const labels: Record<SupportedLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी"
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <label className="stack">
      <span>{t("common.language")}</span>
      <select
        className="button secondary"
        value={i18n.resolvedLanguage ?? "en"}
        onChange={(event) => void setLocale(event.target.value as SupportedLocale)}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {labels[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
