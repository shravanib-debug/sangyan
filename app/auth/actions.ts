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
  redirect("/home");
}

function displayName(formData: FormData): string {
  return String(formData.get("displayName") ?? "").trim().slice(0, 80);
}

export async function signup(formData: FormData) {
  const parsed = credentials(formData);
  if (!parsed) return { error: "Email and a password of at least 8 characters are required." };
  const name = displayName(formData);
  if (!name) return { error: "Please enter your name to create an account." };

  const supabase = await createClient();
  // The name rides along with the account so it is kept even when email confirmation
  // means there is no session yet to write the profile row.
  const { data, error } = await supabase.auth.signUp({ ...parsed, options: { data: { display_name: name } } });
  if (error) return { error: error.message };
  if (data.session && data.user) {
    await supabase.from("profiles").upsert({ user_id: data.user.id, display_name: name });
  }
  redirect("/home");
}

export async function updateDisplayName(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const name = displayName(formData);
  if (!name) return { error: "Please enter a name." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in first." };

  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, display_name: name });
  if (error) return { error: error.message };
  await supabase.auth.updateUser({ data: { display_name: name } });
  return { ok: true as const };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/home");
}
