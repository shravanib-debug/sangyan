const BCP47: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** One date/time format for every screen, following the selected app language. */
export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(BCP47[language] ?? "en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}
