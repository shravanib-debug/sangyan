import { createServer } from "node:http";

import { createClient } from "@supabase/supabase-js";

import { readConfig } from "./config.js";
import { log } from "./log.js";
import { Runner } from "./runner.js";

const config = readConfig();
const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const runner = new Runner(config, db);
runner.start();

const server = createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  // Unhealthy when the lease loop has stalled, so the host restarts the container.
  const healthy = Date.now() - runner.stats.lastTickAt < config.tickMs * 6;
  response.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(
    JSON.stringify({
      status: healthy ? "ok" : "stalled",
      service: "thehrav-broker-worker",
      mode: config.mode,
      activeSessions: runner.stats.activeSessions
    })
  );
});

server.listen(config.port, "0.0.0.0", () => log("info", "worker_started"));

function shutdown(signal: string) {
  log("info", "worker_stopping", { code: signal });
  runner.stop();
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
