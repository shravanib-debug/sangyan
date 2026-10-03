import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateRisk } from "@/engine/score";
import { DEFAULT_ENGINE_CONFIG } from "@/config/defaults";
import type { BrokerEvent, Pact, Trade, WorkerDetectRequest } from "@/engine/types";

// Requires service role key to insert without RLS user context
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.INTERNAL_WORKER_SECRET || "dev_secret"}`;
  
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const event: BrokerEvent = payload.event;
    
    // 1. Deduplicate & insert
    const { data: existingEvent } = await supabaseAdmin
      .from("trade_events")
      .select("id")
      .eq("dedupe_hash", event.dedupeHash)
      .single();

    if (existingEvent) {
      return NextResponse.json({ status: "skipped", reason: "duplicate" });
    }

    const { error: insertError } = await supabaseAdmin
      .from("trade_events")
      .insert({
        id: event.id,
        user_id: event.userId,
        provider: event.provider,
        provider_event_id: event.providerEventId,
        provider_order_id: event.providerOrderId,
        observed_at: event.observedAt,
        received_at: event.receivedAt,
        event_type: event.eventType,
        status: event.status,
        symbol: event.symbol,
        side: event.side,
        quantity: event.quantity,
        average_price_paise: event.averagePricePaise,
        pnl_paise: event.pnlPaise,
        dedupe_hash: event.dedupeHash
      });

    if (insertError) {
      console.error("Failed to insert event", insertError);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // Only evaluate risk if it's a fill
    if (event.status !== "COMPLETE" && event.status !== "FILLED") {
      return NextResponse.json({ status: "success", evaluation: "skipped" });
    }

    // 2. Fetch history and active pact for evaluation
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const [tradesRes, pactRes] = await Promise.all([
      supabaseAdmin
        .from("trade_events")
        .select("*")
        .eq("user_id", event.userId)
        .gte("observed_at", yesterday)
        .order("observed_at", { ascending: false }),
        
      supabaseAdmin
        .from("pacts")
        .select("*")
        .eq("user_id", event.userId)
        .lte("effective_at", event.observedAt)
        .order("effective_at", { ascending: false })
        .limit(1)
    ]);

    const activePactRaw = pactRes.data?.[0];
    const activePact: Pact = activePactRaw ? {
      id: activePactRaw.id,
      userId: activePactRaw.user_id,
      dailyLossLimitPaise: activePactRaw.daily_loss_limit_paise,
      maximumTradesPerDay: activePactRaw.maximum_trades_per_day,
      cooldownAfterLossMinutes: activePactRaw.cooldown_after_loss_minutes,
      blockedWindows: activePactRaw.blocked_windows || [{ startMinuteIst: 0, endMinuteIst: 360 }],
      blockBorrowedFunds: activePactRaw.block_borrowed_funds,
      blockEmergencyFunds: activePactRaw.block_emergency_funds,
      revision: activePactRaw.revision,
      effectiveAt: activePactRaw.effective_at
    } : {
      id: "default",
      userId: event.userId,
      dailyLossLimitPaise: 500000,
      maximumTradesPerDay: 5,
      cooldownAfterLossMinutes: 30,
      blockedWindows: [{ startMinuteIst: 0, endMinuteIst: 360 }],
      blockBorrowedFunds: true,
      blockEmergencyFunds: true,
      revision: 1,
      effectiveAt: new Date(0).toISOString()
    };

    const history: Trade[] = (tradesRes.data || [])
      .filter((t: any) => t.status === "COMPLETE" || t.status === "FILLED")
      .map((t: any) => ({
        id: t.id,
        timestamp: t.observed_at,
        symbol: t.symbol || "UNKNOWN",
        side: t.side as any || "buy",
        quantity: t.quantity || 1,
        pricePaise: t.average_price_paise || 0,
        pnlPaise: t.pnl_paise || 0,
        orderId: t.provider_order_id,
        source: "connected"
      }));

    // Add current event to history if not there
    if (!history.find(h => h.id === event.id)) {
      history.unshift({
        id: event.id,
        timestamp: event.observedAt,
        symbol: event.symbol || "UNKNOWN",
        side: event.side || "buy",
        quantity: event.quantity || 1,
        pricePaise: event.averagePricePaise || 0,
        pnlPaise: event.pnlPaise || 0,
        orderId: event.providerOrderId,
        source: "connected"
      });
    }

    const evalRequest: WorkerDetectRequest = {
      history,
      pact: activePact,
      nowEpochMs: new Date(event.observedAt).getTime(),
      config: DEFAULT_ENGINE_CONFIG
    };

    const result = evaluateRisk(evalRequest);

    // 3. Save assessment
    await supabaseAdmin.from("risk_assessments").insert({
      id: result.assessmentId,
      user_id: event.userId,
      score: result.score,
      tier: result.tier,
      signal_hits: result.signalHits,
      hard_rule_overrides: result.hardRuleOverrides,
      engine_version: result.engineVersion,
      config_version: result.configVersion,
      evaluated_at: result.evaluatedAt
    });

    // 4. Save pause event if L1, L2, L3
    if (result.tier !== "L0") {
      const pauseEvent = {
        id: crypto.randomUUID(),
        user_id: event.userId,
        assessment_id: result.assessmentId,
        tier: result.tier,
        started_at: result.evaluatedAt,
        outcome: "waiting"
      };
      
      await supabaseAdmin.from("pause_events").insert(pauseEvent);
      
      // 5. Enqueue push notification via outbox
      await supabaseAdmin.from("outbox").insert({
        user_id: event.userId,
        event_type: "risk_escalation",
        payload: { tier: result.tier, assessment_id: result.assessmentId },
        status: "pending",
        idempotency_key: result.assessmentId
      });
    }

    return NextResponse.json({ status: "success", assessment: result });
  } catch (err: any) {
    console.error("Ingest error:", err);
    return NextResponse.json({ error: "internal_error", details: err.message }, { status: 500 });
  }
}
