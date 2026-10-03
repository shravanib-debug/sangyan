import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** In-app inbox: waiting pauses (id, tier, time). Details load only through /api/pauses/[id]. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("pause_events")
    .select("id, tier, started_at, expires_at")
    .eq("outcome", "waiting")
    .order("started_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 500 });
  return NextResponse.json({ pauses: data }, { headers: { "Cache-Control": "no-store" } });
}
