import { describe, it, expect } from "vitest";
import { assertNoAdvice, sanitizeAdvice, formatStrictMirrorMessage } from "../../src/engine/guardrails";

describe("Copy Guardrails", () => {
  describe("assertNoAdvice", () => {
    it("passes clean text", () => {
      expect(() => assertNoAdvice("You have exceeded your self-authored daily loss limit.")).not.toThrow();
    });

    it("throws on speculative keywords", () => {
      expect(() => assertNoAdvice("We predict the market will recover.")).toThrowError(/predict/);
      expect(() => assertNoAdvice("You should buy HDFC.")).toThrowError(/should buy/);
      expect(() => assertNoAdvice("This is a guarantee.")).toThrowError(/guarantee/);
    });
  });

  describe("sanitizeAdvice", () => {
    it("filters out speculative words", () => {
      const input = "I recommend you should buy this stock now.";
      const output = sanitizeAdvice(input);
      expect(output).toContain("[REDACTED_ADVICE]");
      expect(output).not.toContain("recommend");
      expect(output).not.toContain("should buy");
    });
  });

  describe("formatStrictMirrorMessage", () => {
    it("formats safely", () => {
      const msg = formatStrictMirrorMessage("You have placed 5 trades today");
      expect(msg).toBe("Based on your stated rules: You have placed 5 trades today. This is not financial advice.");
    });

    it("fails to format if base fact contains advice", () => {
      expect(() => formatStrictMirrorMessage("You should sell now")).toThrow();
    });
  });
});
