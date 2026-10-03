"use client";

import { useTranslation } from "@/i18n/client";
import { card, primary } from "@/features/app/theme";

export function PostLossReview() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-black">Process Review</h1>
        <p className="font-medium text-gray-600">Reflecting on recent activity</p>
      </header>

      <section className={card + " space-y-4"}>
        <p className="text-gray-700">
          Thehrav detected recent losses. The goal here is not to grade the outcome—markets are unpredictable—but to review your process.
        </p>
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4">
          <h3 className="font-bold text-blue-800">Signals Fired During This Period</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-blue-900 font-medium">
            <li>Revenge trade detected (within 15 minutes of prior loss)</li>
            <li>Loss-hold ratio exceeded 2.0x</li>
          </ul>
        </div>
      </section>

      <section className={card + " space-y-4"}>
        <h3 className="font-bold">Self-Reflection</h3>
        <p className="text-sm text-gray-600">Did you follow the rules you set in your Pact?</p>
        
        <div className="flex flex-col space-y-2 mt-4">
          <button className={primary + " w-full"}>Yes, the process was followed</button>
          <button className="button secondary w-full">No, rules were breached</button>
        </div>
      </section>

      <p className="text-xs text-gray-400 text-center mt-4">
        This reflection is private and remains exclusively on your device.
      </p>
    </div>
  );
}
