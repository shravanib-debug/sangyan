"use client";

import { useTranslation } from "react-i18next";
import { card, primary } from "@/features/app/theme";

export function PanicCompanion() {
  const { t } = useTranslation();

  return (
    <div className="responsive-page narrow space-y-6 pb-12">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-black text-red-700">{t("panic.title")}</h1>
        <p className="text-xl font-medium text-gray-700">{t("panic.subtitle")}</p>
      </header>

      <section className={card + " space-y-4"}>
        <h2 className="text-xl font-bold">{t("panic.whatTitle")}</h2>
        <p className="text-gray-700">{t("panic.whatBody")}</p>

        <div className="bg-red-50 p-4 rounded-lg border border-red-100">
          <h3 className="font-bold text-red-800">{t("panic.contextTitle")}</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-sm text-red-700">
            <li>{t("panic.point1")}</li>
            <li>{t("panic.point2")}</li>
            <li>{t("panic.point3")}</li>
          </ul>
        </div>
      </section>

      <section className={card + " text-center space-y-4"}>
        <p className="font-medium text-lg">{t("panic.waitBody")}</p>
        <button className={primary + " w-full py-4 text-lg"} onClick={() => window.history.back()}>
          {t("panic.done")}
        </button>
      </section>
    </div>
  );
}
