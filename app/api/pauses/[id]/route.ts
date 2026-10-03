import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/** Protected explanation for a pause. Push payloads never carry this; it loads after sign-in. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: pause } = await supabase
    .from("pause_events")
    .select("id, assessment_id, tier, started_at, expires_at, outcome, revision")
    .eq("id", id)
    .maybeSingle();
  if (!pause) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: assessment } = await supabase
    .from("risk_assessments")
    .select("id, score, tier, signal_hits, hard_rule_overrides, engine_version, config_version, evaluated_at, trade_event_id")
    .eq("id", pause.assessment_id as string)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let simulated = false;
  if (assessment.trade_event_id) {
    const { data: tradeEvent } = await supabase
      .from("trade_events")
      .select("source")
      .eq("id", assessment.trade_event_id as string)
      .maybeSingle();
    simulated = tradeEvent?.source === "synthetic";
  }

  return NextResponse.json({ pause, assessment, simulated }, { headers: { "Cache-Control": "no-store" } });
}
