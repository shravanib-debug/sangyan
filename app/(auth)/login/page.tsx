"use client";

import { login, signup } from "../../auth/actions";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { localDatabase } from "@/storage/local/database";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAction(formData: FormData, action: "login" | "signup") {
    setLoading(true);
    setError(null);
    try {
      // Mark onboarding as completed when user tries to login/signup
      await localDatabase.settings.put({ key: "onboardingCompleted", value: true });
      
      const res = action === "login" ? await login(formData) : await signup(formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch (e: unknown) {
      setError((e as Error).message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 px-6 py-12">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center space-y-6">
        <h1 className="text-3xl font-bold text-center">Sign In / Sign Up</h1>
        
        {error && (
          <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input 
              name="email" 
              type="email" 
              required 
              className="w-full p-4 border border-gray-300 rounded-xl"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input 
              name="password" 
              type="password" 
              required 
              className="w-full p-4 border border-gray-300 rounded-xl"
              placeholder="••••••••"
            />
          </div>
          <div className="grid gap-4 pt-4">
            <button 
              formAction={(f) => handleAction(f, "login")}
              disabled={loading}
              className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Log In
            </button>
            <button 
              formAction={(f) => handleAction(f, "signup")}
              disabled={loading}
              className="w-full p-4 bg-white border-2 border-gray-200 text-gray-800 rounded-xl font-bold hover:border-gray-300 disabled:opacity-50 transition-colors"
            >
              Sign Up
            </button>
            <button 
              type="button"
              onClick={() => router.push("/")}
              disabled={loading}
              className="w-full p-2 text-gray-500 font-medium hover:text-gray-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
