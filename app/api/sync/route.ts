import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const items = body.items || [];

    const results = [];

    for (const item of items) {
      const { entityType, payload, id: idempotency_key } = item;
      let error = null;

      if (entityType === "pact") {
        const { error: dbError } = await supabase.from("pacts").upsert({
          user_id: user.id,
          daily_loss_limit_paise: payload.dailyLossLimitPaise,
          maximum_trades_per_day: payload.maximumTradesPerDay,
          cooldown_after_loss_minutes: payload.cooldownAfterLossMinutes,
          blocked_windows: payload.blockedWindows || [],
          block_borrowed_funds: payload.blockBorrowedFunds ?? true,
          block_emergency_funds: payload.blockEmergencyFunds ?? true,
          revision: payload.revision,
          effective_at: payload.effectiveAt || new Date().toISOString()
        });
        error = dbError;
      } else if (entityType === "checkin") {
        const { error: dbError } = await supabase.from("checkins").insert({
          id: payload.id,
          user_id: user.id,
          occurred_at: payload.timestamp,
          amount_paise: payload.amountPaise || 0,
          fund_source: payload.fundSource || 'surplus',
          borrow_kind: payload.borrowKind || 'none',
          horizon: payload.horizon || 'intraday',
          reason: payload.reason || 'Checkin',
          exit_condition: payload.exitCondition || 'N/A',
          idempotency_key: idempotency_key || payload.id
        });
        error = dbError;
      } else if (entityType === "pause") {
        const { error: dbError } = await supabase.from("pause_events").insert({
          id: payload.id,
          user_id: user.id,
          assessment_id: payload.assessmentId,
          tier: payload.tier,
          started_at: payload.startedAt,
          expires_at: payload.expiresAt,
          outcome: payload.outcome || 'waiting',
          idempotency_key: idempotency_key || payload.id
        });
        error = dbError;
      } else if (entityType === "journal") {
        const { error: dbError } = await supabase.from("journal_entries").insert({
          id: payload.id,
          user_id: user.id,
          reason: payload.reason,
          horizon: payload.horizon || 'intraday',
          exit_condition: payload.exitCondition || 'N/A',
          transcript_source: payload.transcriptSource || 'typed',
          created_at: payload.createdAt,
          idempotency_key: idempotency_key || payload.id
        });
        error = dbError;
      }

      results.push({ id: idempotency_key, status: error ? "failed" : "success", error: error?.message });
    }

    return NextResponse.json({ results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
