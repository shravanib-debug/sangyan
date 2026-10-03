import type { SupabaseClient } from "@supabase/supabase-js";

export type ConsentPurpose = "sync" | "journal_sync" | "broker_monitoring" | "push";
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = ["sync", "journal_sync", "broker_monitoring", "push"];
export const POLICY_VERSION = "2026-10-03";

export async function getActiveConsentId(
  client: SupabaseClient,
  userId: string,
  purpose: ConsentPurpose
): Promise<string | null> {
  const { data } = await client
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function grantConsent(client: SupabaseClient, userId: string, purpose: ConsentPurpose): Promise<string> {
  const existing = await getActiveConsentId(client, userId, purpose);
  if (existing) return existing;
  const { data, error } = await client
    .from("consents")
    .insert({ user_id: userId, purpose, policy_version: POLICY_VERSION })
    .select("id")
    .single();
  if (error || !data) throw new Error("consent_grant_failed");
  return data.id as string;
}

export async function revokeConsent(client: SupabaseClient, userId: string, purpose: ConsentPurpose): Promise<void> {
  const { error } = await client
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("revoked_at", null);
  if (error) throw new Error("consent_revoke_failed");
}
