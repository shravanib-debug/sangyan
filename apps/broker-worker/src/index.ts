import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);

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
      phase: 0,
      mode: process.env.BROKER_WORKER_MODE ?? "replay",
      monitoring: false
    })
  );
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "worker_started", port, phase: 0 }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "worker_stopping", signal }));
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
