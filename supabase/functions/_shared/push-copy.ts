/**
 * Push copy is deliberately generic: no amount, symbol, money source, journal text
 * or tier. Details are fetched only after the user opens the app and is authenticated.
 * Shared with the Edge Function (supabase/functions/_shared/push-copy.ts re-exports it).
 */
export const PUSH_COPY = {
  en: {
    title: "Thehrav",
    body: "Take a calm moment. Open Thehrav to review your pause.",
    simulatedBody: "Simulated replay: open Thehrav to see how a pause works."
  },
  hi: {
    title: "ठहराव",
    body: "एक शांत पल लें। अपना विराम देखने के लिए ठहराव खोलें।",
    simulatedBody: "नकली रीप्ले: विराम कैसे काम करता है देखने के लिए ठहराव खोलें।"
  },
  mr: {
    title: "ठहराव",
    body: "एक शांत क्षण घ्या. तुमचा विराम पाहण्यासाठी ठहराव उघडा.",
    simulatedBody: "नक्कल रीप्ले: विराम कसा चालतो ते पाहण्यासाठी ठहराव उघडा."
  }
} as const;

export type PushLocale = keyof typeof PUSH_COPY;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function buildPushPayload(input: { pauseId: string; simulated: boolean; locale: string }): PushPayload {
  const copy = PUSH_COPY[(input.locale in PUSH_COPY ? input.locale : "en") as PushLocale];
  return {
    title: copy.title,
    body: input.simulated ? copy.simulatedBody : copy.body,
    url: `/pause?pauseId=${encodeURIComponent(input.pauseId)}`,
    tag: `pause-${input.pauseId}`
  };
}
