export const SPECULATIVE_KEYWORDS = [
  "predict",
  "recommend",
  "should buy",
  "should sell",
  "forecast",
  "guarantee",
  "target price",
  "will go up",
  "will go down",
  "sure thing",
  "advice",
  "buy now",
  "sell now"
];

/**
 * Validates that text does not contain speculative or advice-giving keywords.
 * Throws an error if any are found, enforcing the "No advice, no prediction" rule.
 */
export function assertNoAdvice(text: string): void {
  const lower = text.toLowerCase();
  for (const keyword of SPECULATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      throw new Error(`Guardrail violation: Text contains speculative keyword '${keyword}'`);
    }
  }
}

/**
 * Sanitizes text by replacing speculative keywords with a neutral placeholder.
 */
export function sanitizeAdvice(text: string): string {
  let sanitized = text;
  for (const keyword of SPECULATIVE_KEYWORDS) {
    // Case-insensitive replacement
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    sanitized = sanitized.replace(regex, "[REDACTED_ADVICE]");
    
    // Also try without word boundaries for multi-word phrases
    if (keyword.includes(' ')) {
      const phraseRegex = new RegExp(keyword, 'gi');
      sanitized = sanitized.replace(phraseRegex, "[REDACTED_ADVICE]");
    }
  }
  return sanitized;
}

/**
 * Formats a message with strict "mirror" boundaries, ensuring we only state rules.
 */
export function formatStrictMirrorMessage(fact: string): string {
  assertNoAdvice(fact);
  return `Based on your stated rules: ${fact}. This is not financial advice.`;
}
