import { NextResponse, type NextRequest } from "next/server";

import { getActiveConsentId } from "@/lib/auth/consent";
import { isSameOrigin } from "@/lib/auth/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processSyncItem } from "@/lib/sync/process";
import { syncRequestSchema } from "@/lib/validation/schemas";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const userClient = await createClient();
  const {
    data: { user }
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [syncConsent, journalConsent] = await Promise.all([
    getActiveConsentId(userClient, user.id, "sync"),
    getActiveConsentId(userClient, user.id, "journal_sync")
  ]);
  if (!syncConsent) return NextResponse.json({ error: "consent_required", purpose: "sync" }, { status: 403 });

  const context = {
    userClient,
    admin: createAdminClient(),
    userId: user.id,
    nowMs: Date.now(),
    consents: { sync: true, journalSync: Boolean(journalConsent) }
  };

  // Sequential: a pause depends on the assessment written by its check-in.
  const results = [];
  for (const item of parsed.data.items) {
    results.push(await processSyncItem(context, item));
  }
  return NextResponse.json({ results });
}
