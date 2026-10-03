/** Structured logs carry ids and codes only: never tokens, payloads or financial values. */
export function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: { code?: string; connectionId?: string } = {}
): void {
  console.log(JSON.stringify({ level, event, ...fields }));
}
