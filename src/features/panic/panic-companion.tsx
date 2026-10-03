"use client";

import { useTranslation } from "@/i18n/client";
import { card, primary } from "@/features/app/theme";

export function PanicCompanion() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-black text-red-700">Pause.</h1>
        <p className="text-xl font-medium text-gray-700">Breathe. The market will still be there.</p>
      </header>

      <section className={card + " space-y-4"}>
        <h2 className="text-xl font-bold">What is happening?</h2>
        <p className="text-gray-700">
          You tapped the panic button. This means you recognized a strong impulse to act immediately.
        </p>
        
        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
          <h3 className="font-bold text-red-800">Historical Context</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-red-700">
            <li>Revenge trades made in a state of panic historically lead to larger drawdowns.</li>
            <li>No single trade defines your financial future.</li>
            <li>Your rules were made when you were calm. Trust your calm self.</li>
          </ul>
        </div>
      </section>

      <section className={card + " text-center space-y-4"}>
        <p className="font-medium text-lg">Take a full 5 minutes before making any decision.</p>
        <button 
          className={primary + " w-full py-4 text-lg"}
          onClick={() => window.history.back()}
        >
          I have paused. Go back.
        </button>
      </section>
    </div>
  );
}
