import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.endsWith("pnpm-lock.yaml"));

const assignment = /^(ZERODHA_API_SECRET|BROKER_TOKEN_ENCRYPTION_KEY|BROKER_INTERNAL_SIGNING_KEY|SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY)=(.+)$/gm;
const knownCredential = /(sk_live_[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{30,})/g;
const safePrefixes = ["replace-", "example-", "test-", "local-"];
const violations = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const match of content.matchAll(assignment)) {
    const value = match[2]?.trim() ?? "";
    if (value && !safePrefixes.some((prefix) => value.startsWith(prefix))) {
      violations.push(`${file}: possible real value assigned to ${match[1]}`);
    }
  }
  if (knownCredential.test(content)) violations.push(`${file}: known credential pattern`);
  knownCredential.lastIndex = 0;

  if (file.startsWith("fixtures/") && /"synthetic"\s*:\s*false/i.test(content)) {
    violations.push(`${file}: non-synthetic fixture is forbidden`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret and fixture scan passed for ${files.length} tracked files.`);
}
