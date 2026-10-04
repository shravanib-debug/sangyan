"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/provider";
import type { SupportedLocale } from "@/i18n/resources";
import { localDatabase } from "@/storage/local/database";

export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<number>(0);

  const handleLanguageSelect = async (lang: SupportedLocale) => {
    await setLocale(lang);
    setStep(1);
  };

  const handlePrivacyAccept = () => {
    setStep(2);
  };

  const completeOnboarding = async (destination: "/pact" | "/login") => {
    await localDatabase.settings.put({ key: "onboardingCompleted", value: true });
    router.push(destination);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-6 py-12">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        {step === 0 && (
          <div className="space-y-6 animate-in fade-in">
            <h1 className="text-2xl font-bold text-center">{t("onboarding.languageTitle")}</h1>
            <div className="grid gap-4">
              <button onClick={() => void handleLanguageSelect('en')} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all font-medium">English</button>
              <button onClick={() => void handleLanguageSelect('hi')} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all font-medium">हिंदी</button>
              <button onClick={() => void handleLanguageSelect('mr')} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all font-medium">मराठी</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h1 className="text-2xl font-bold">{t("onboarding.privacyTitle")}</h1>
            <p className="text-gray-600 leading-relaxed text-lg">
              {t("onboarding.privacyBody")}
            </p>
            <p className="text-gray-600 text-base">{t("common.limitation")}</p>
            <div className="pt-8">
              <button 
                onClick={handlePrivacyAccept} 
                className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
              >
                {t("onboarding.acceptPrivacy")}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <h1 className="text-2xl font-bold">{t("onboarding.authTitle")}</h1>
            <p className="text-gray-500 text-sm mb-6">{t("onboarding.authNote")}</p>
            <div className="grid gap-4">
              <button 
                onClick={() => void completeOnboarding("/pact")} 
                className="w-full p-4 bg-white border-2 border-gray-200 text-gray-800 rounded-xl font-bold hover:border-gray-300 transition-colors"
              >
                {t("onboarding.authGuest")}
              </button>
              <button 
                onClick={() => void completeOnboarding("/login")} 
                className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors"
              >
                {t("onboarding.authSync")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
