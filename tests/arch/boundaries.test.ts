import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("architecture boundaries", () => {
  it("keeps the engine independent from frameworks and I/O", () => {
    const forbidden = ["react", "next/", "dexie", "@supabase", "@/features", "@/lib"];
    for (const file of filesUnder("src/engine")) {
      const content = readFileSync(file, "utf8");
      for (const dependency of forbidden) expect(content).not.toContain(`from \"${dependency}`);
      expect(content).not.toContain("Math.random");
      expect(content).not.toContain("Date.now");
    }
  });

  it("does not expose order mutation routes or worker methods", () => {
    const sourceFiles = [
      ...filesUnder("app"),
      ...filesUnder("src"),
      ...filesUnder("apps/broker-worker/src")
    ].filter((file) => /\.(ts|tsx)$/.test(file));

    const forbiddenMethodPatterns = [
      /\bplaceOrder\s*\(/,
      /\bmodifyOrder\s*\(/,
      /\bcancelOrder\s*\(/,
      /\bplaceGtt\s*\(/,
      /\bplaceBasket\s*\(/
    ];

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbiddenMethodPatterns) expect(content).not.toMatch(pattern);
    }
  });
});
