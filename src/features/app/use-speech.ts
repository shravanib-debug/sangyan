"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const subscribeNever = () => () => {};
const detectSupport = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function useSpeech() {
  const { i18n } = useTranslation();
  const supported = useSyncExternalStore(subscribeNever, detectSupport, () => false);
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (!supported) return;

    window.speechSynthesis.cancel(); // cancel any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    // map i18n lang to BCP 47
    const langMap: Record<string, string> = {
      en: "en-IN",
      hi: "hi-IN",
      mr: "mr-IN",
    };
    utterance.lang = langMap[i18n.language] || "en-US";
    
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [supported, i18n.language]);

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [supported]);

  return { supported, speaking, speak, stop };
}
