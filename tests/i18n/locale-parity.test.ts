import { describe, expect, it } from "vitest";

import { resources, supportedLocales } from "@/i18n/resources";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("locale resources", () => {
  it("contains exactly the supported locales", () => {
    expect(Object.keys(resources).sort()).toEqual([...supportedLocales].sort());
  });

  it("keeps every locale in key parity with English", () => {
    const englishKeys = keys(resources.en.translation).sort();
    for (const locale of supportedLocales) {
      expect(keys(resources[locale].translation).sort()).toEqual(englishKeys);
    }
  });

  it("has no blank locale values", () => {
    for (const locale of supportedLocales) {
      for (const key of keys(resources[locale].translation)) {
        expect(key).not.toBe("");
      }
    }
  });
});
