import { en } from "./locales/en";
import { hi } from "./locales/hi";
import { mr } from "./locales/mr";

export const supportedLocales = ["en", "hi", "mr"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  mr: { translation: mr }
} as const;
