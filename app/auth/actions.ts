"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return email && password.length >= 8 ? { email, password } : null;
}

// Guest data needs no merge step here: everything created offline is already in the
// local sync queue under client-generated ids and uploads idempotently once the user
// turns on sync in Settings.
export async function login(formData: FormData) {
  const parsed = credentials(formData);
  if (!parsed) return { error: "Email and a password of at least 8 characters are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed);
  if (error) return { error: error.message };
  redirect("/settings");
}

export async function signup(formData: FormData) {
  const parsed = credentials(formData);
  if (!parsed) return { error: "Email and a password of at least 8 characters are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed);
  if (error) return { error: error.message };
  redirect("/settings");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/home");
}
