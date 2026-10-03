"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { login, signup } from "../../auth/actions";

export default function LoginPage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAction(formData: FormData, action: "login" | "signup") {
    setLoading(true);
    setError(null);
    try {
      const result = action === "login" ? await login(formData) : await signup(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
    } catch (caught: unknown) {
      // A successful action redirects; Next signals that by throwing, which must not show as an error.
      if ((caught as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw caught;
      setError(t("auth.unexpected"));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-6 py-12">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center space-y-6">
        <h1 className="text-3xl font-bold text-center">{t("auth.title")}</h1>

        {error && (
          <div role="alert" className="p-4 bg-red-50 text-red-800 border border-red-300 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {t("auth.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full p-4 border border-gray-300 rounded-xl"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              {t("auth.password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="w-full p-4 border border-gray-300 rounded-xl"
            />
          </div>
          <div className="grid gap-4 pt-4">
            <button
              formAction={(formData) => handleAction(formData, "login")}
              disabled={loading}
              className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-50"
            >
              {t("auth.login")}
            </button>
            <button
              formAction={(formData) => handleAction(formData, "signup")}
              disabled={loading}
              className="w-full p-4 bg-white border-2 border-gray-300 text-gray-900 rounded-xl font-bold hover:bg-gray-50 disabled:opacity-50"
            >
              {t("auth.signup")}
            </button>
            <button
              type="button"
              onClick={() => router.push("/home")}
              disabled={loading}
              className="w-full p-3 text-gray-700 font-medium disabled:opacity-50"
            >
              {t("auth.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
