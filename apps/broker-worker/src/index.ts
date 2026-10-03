import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SECRET_KEY || "";
const apiUrl = process.env.API_URL || "http://localhost:3000";
const internalSecret = process.env.INTERNAL_WORKER_SECRET || "dev_secret";

const supabase = createClient(supabaseUrl, supabaseKey);

// Mock worker loop
let isRunning = true;

async function workerLoop() {
  while (isRunning) {
    try {
      // Find all live connections
      const { data: connections, error } = await supabase
        .from("broker_connections")
        .select("*")
        .eq("status", "live");

      if (error) {
        console.error("Error fetching connections:", error);
      } else {
        for (const conn of connections || []) {
          // Generate a synthetic event for this connection occasionally (e.g. 5% chance per tick)
          if (Math.random() < 0.05) {
            const eventId = crypto.randomUUID();
            const payload = {
              id: eventId,
              userId: conn.user_id,
              provider: conn.provider,
              providerEventId: `ev_${Date.now()}`,
              providerOrderId: `ord_${Date.now()}`,
              observedAt: new Date().toISOString(),
              receivedAt: new Date().toISOString(),
              eventType: "trade_update",
              status: "COMPLETE",
              symbol: "MOCK_STOCK",
              side: Math.random() > 0.5 ? "buy" : "sell",
              quantity: Math.floor(Math.random() * 10) + 1,
              averagePricePaise: Math.floor(Math.random() * 50000) + 10000,
              dedupeHash: crypto.createHash('sha256').update(eventId).digest('hex')
            };

            await fetch(`${apiUrl}/api/broker/ingest`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${internalSecret}`
              },
              body: JSON.stringify({ event: payload })
            }).catch(console.error);
          }

          // Update heartbeat
          await supabase.from("broker_connections")
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq("id", conn.id);
        }
      }
    } catch (e) {
      console.error("Worker error:", e);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

workerLoop();

const server = createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(
    JSON.stringify({
      status: "ok",
      service: "thehrav-broker-worker",
      mode: process.env.BROKER_WORKER_MODE ?? "replay",
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "worker_started", port }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "worker_stopping", signal }));
  isRunning = false;
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
