import { expect, test } from "vitest";
import { calculateMetrics } from "./metrics";

test("calculates BRS correctly with all inputs present", () => {
  const result = calculateMetrics({
    honouredPauses: 8,
    shownPauses: 10,
    tier2OrHigherEvents: 2,
    evaluatedEvents: 10,
    checkInsWithJournal: 5,
    checkIns: 10,
    adheredDays: 9,
    evaluatedDays: 10
  });

  expect(result.PHR).toBeCloseTo(0.8);
  expect(result.II).toBeCloseTo(0.2);
  expect(result.JC).toBeCloseTo(0.5);
  expect(result.RA).toBeCloseTo(0.9);
  
  // 100 * (0.35*0.8 + 0.25*0.9 + 0.20*(1-0.2) + 0.20*0.5)
  // = 100 * (0.28 + 0.225 + 0.16 + 0.1)
  // = 100 * 0.765 = 76.5
  expect(result.BRS).toBeCloseTo(76.5);
});

test("returns unavailable for empty denominators", () => {
  const result = calculateMetrics({
    honouredPauses: 0,
    shownPauses: 0,
    tier2OrHigherEvents: 0,
    evaluatedEvents: 0,
    checkInsWithJournal: 0,
    checkIns: 0,
    adheredDays: 0,
    evaluatedDays: 0
  });

  expect(result.PHR).toBe("unavailable");
  expect(result.II).toBe("unavailable");
  expect(result.JC).toBe("unavailable");
  expect(result.RA).toBe("unavailable");
  expect(result.BRS).toBe("unavailable");
});
