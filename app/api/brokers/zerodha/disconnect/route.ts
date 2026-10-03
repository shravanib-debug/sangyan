import { NextResponse, type NextRequest } from "next/server";

import { revokeConsent } from "@/lib/auth/consent";
import { isSameOrigin } from "@/lib/auth/origin";
import { disconnectConnection } from "@/lib/broker/connection-store";
import { readServerEnvironment } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Revokes monitoring consent, stops the worker lease and deletes stored access material. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await disconnectConnection(createAdminClient(), user.id, readServerEnvironment(), new Date().toISOString());
    await revokeConsent(supabase, user.id, "broker_monitoring");
  } catch {
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }
  return NextResponse.json({ status: "disconnected" });
}
