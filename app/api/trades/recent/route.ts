import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The signed-in user's own canonical fills from the last 3 days, the same window and
 * columns the server re-check uses, so a check-in on the device sees the same history.
 * Row-level security limits the query to the caller's rows.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("trade_events")
    .select("id, observed_at, symbol, side, quantity, average_price_paise, provider_order_id, status")
    .gte("observed_at", new Date(Date.now() - HISTORY_WINDOW_MS).toISOString())
    .order("observed_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  return NextResponse.json({ rows: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
