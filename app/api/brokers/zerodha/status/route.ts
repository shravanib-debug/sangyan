import { NextResponse } from "next/server";

import { getConnectionSummary } from "@/lib/broker/connection-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Provider, health and expiry only; never credentials. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const summary = await getConnectionSummary(createAdminClient(), user.id, Date.now());
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
