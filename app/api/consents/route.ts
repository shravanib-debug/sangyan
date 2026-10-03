import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { CONSENT_PURPOSES, grantConsent, revokeConsent } from "@/lib/auth/consent";
import { isSameOrigin } from "@/lib/auth/origin";
import { disconnectConnection } from "@/lib/broker/connection-store";
import { readServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  purpose: z.enum(CONSENT_PURPOSES as [string, ...string[]]),
  granted: z.boolean()
});

/** Grant or revoke a purpose-specific consent. Revocation also stops the data flow it governed. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const purpose = parsed.data.purpose as (typeof CONSENT_PURPOSES)[number];

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    if (parsed.data.granted) {
      await grantConsent(supabase, user.id, purpose);
    } else {
      await revokeConsent(supabase, user.id, purpose);
      const admin = createAdminClient();
      if (purpose === "broker_monitoring") {
        await disconnectConnection(admin, user.id, readServerEnvironment(), new Date().toISOString());
      }
      if (purpose === "push") {
        await admin
          .from("push_subscriptions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .is("revoked_at", null);
      }
    }
  } catch {
    return NextResponse.json({ error: "consent_update_failed" }, { status: 500 });
  }
  return NextResponse.json({ purpose, granted: parsed.data.granted });
}
