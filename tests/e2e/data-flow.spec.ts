import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

async function submitCheckIn(
  page: Page,
  input: { amount: string; source: "surplus" | "borrowed"; reason: string; exit: string }
) {
  await page.goto("/checkin");
  await page.getByLabel("Trade amount (INR)").fill(input.amount);
  await page.getByLabel("Money source").selectOption(input.source);
  if (input.source === "borrowed") {
    await page.getByLabel("Type of borrowing").selectOption("instant_loan");
  }
  await page.getByLabel("Expected holding period").selectOption(input.source === "surplus" ? "weeks" : "intraday");
  await page.getByLabel("Why this trade now?").fill(input.reason);
  await page.getByLabel("What is the exit condition?").fill(input.exit);
  await page.getByRole("button", { name: "Evaluate Decision" }).click();
  await expect(page.getByRole("heading", { name: "Cooling-off Pause" })).toBeVisible();
}

function scoreFrom(text: string): number {
  const match = text.match(/Score (\d+) of 100/);
  if (!match?.[1]) throw new Error(`score missing from: ${text}`);
  return Number(match[1]);
}

async function simulationResults(page: Page): Promise<[number, number]> {
  const section = page.locator('section[aria-live="polite"]');
  await expect(section).toBeVisible();
  const values = (await section.innerText()).match(/\d+\.\d+%/g)?.map((value) => Number.parseFloat(value)) ?? [];
  if (values.length !== 2) throw new Error(`expected two simulation percentages, received ${values.join(", ")}`);
  return [values[0]!, values[1]!];
}

test("check-in, import, pause, review and journal use the submitted and persisted data", async ({ page }) => {
  const fixedNoon = new Date("2026-10-05T06:30:00.000Z");
  await page.addInitScript((fixedNow) => {
    Date.now = () => fixedNow;
  }, fixedNoon.getTime());
  const lowReason = "Planned calmly from surplus cash";
  const lowExit = "Exit at the written stop";
  await submitCheckIn(page, { amount: "1000", source: "surplus", reason: lowReason, exit: lowExit });

  const lowPauseText = await page.locator("main, body").innerText();
  expect(lowPauseText).toContain("L0 ·");
  expect(scoreFrom(lowPauseText)).toBe(0);
  await page.getByRole("button", { name: "I understand, continue anyway" }).click();
  await page.waitForURL("**/home");

  await page.goto("/review");
  await expect(page.getByText(lowReason)).toBeVisible();
  await expect(page.getByText(lowExit)).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText(lowReason)).toBeVisible();
  await expect(page.getByText("₹1,000")).toBeVisible();

  await page.goto("/import");
  const upload = page.locator('input[type="file"]');
  const sample = readFileSync("fixtures/synthetic_revenge.csv", "utf8");
  await upload.setInputFiles({ name: "synthetic_revenge.csv", mimeType: "text/csv", buffer: Buffer.from(sample) });
  await expect(page.getByText("2 / 3 trades flagged")).toBeVisible();
  await expect(page.getByText(/Quick follow-up after a loss: Observed 5 minutes/)).toBeVisible();

  const withoutReentry = sample
    .split(/\r?\n/)
    .filter((row) => !row.startsWith("INFY,Buy,200,"))
    .join("\n");
  await upload.setInputFiles({ name: "without_reentry.csv", mimeType: "text/csv", buffer: Buffer.from(withoutReentry) });
  await expect(page.getByText("1 / 2 trades flagged")).toBeVisible();
  await expect(page.getByText(/Quick follow-up after a loss: Observed 5 minutes/)).toHaveCount(0);

  const now = fixedNoon.getTime();
  const recentLossCsv = [
    "Symbol,Side,Qty,Price,Time",
    `INFY,Buy,10,100,${new Date(now - 10 * 60_000).toISOString()}`,
    `INFY,Sell,10,80,${new Date(now - 5 * 60_000).toISOString()}`,
    `RELIANCE,Buy,1,100,${new Date(now - 60_000).toISOString()}`
  ].join("\n");
  await upload.setInputFiles({ name: "recent_loss.csv", mimeType: "text/csv", buffer: Buffer.from(recentLossCsv) });
  await expect(page.getByText(/\/ 3 trades flagged/)).toBeVisible();

  const highReason = "Trying to recover the recent loss immediately";
  const highExit = "No clear exit plan";
  await submitCheckIn(page, { amount: "25000", source: "borrowed", reason: highReason, exit: highExit });

  const highPauseText = await page.locator("main, body").innerText();
  expect(highPauseText).toContain("L3 ·");
  const highScore = scoreFrom(highPauseText);
  expect(highScore).toBeGreaterThan(scoreFrom(lowPauseText));
  expect(highPauseText).toContain("Money source: borrowed money");
  expect(highPauseText).toContain("after a loss");
  expect(highPauseText).toContain("Pact cooldown");
  await expect(page.getByRole("timer")).toBeVisible();

  await page.getByRole("button", { name: "Step away (Good call)" }).click();
  await page.waitForURL("**/home");

  await page.goto("/review");
  await expect(page.getByText(highReason)).toBeVisible();
  await expect(page.getByText(highExit)).toBeVisible();
  await expect(page.getByText(/Pause level 3 · You stepped away/)).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText(highReason)).toBeVisible();
  await expect(page.getByText("₹25,000")).toBeVisible();
  await expect(page.getByText(`Score ${highScore} of 100 · Pause level 3`)).toBeVisible();
  await expect(page.getByText("You stepped away")).toBeVisible();
});

test("simulator inputs drive cohort outputs while recovery math remains fixed", async ({ page }) => {
  await page.addInitScript((fixedNow) => {
    Date.now = () => fixedNow;
  }, new Date("2026-10-05T06:30:00.000Z").getTime());
  await page.goto("/simulator");
  const capital = page.getByLabel("Starting Capital (INR)");
  const leverage = page.getByLabel(/Leverage:/);
  const lossLimit = page.getByLabel("Daily Loss Limit (INR)");
  const volatility = page.getByLabel(/Market Volatility:/);
  const run = page.getByRole("button", { name: "Run Simulation" });

  await capital.fill("100000");
  await leverage.fill("8");
  await lossLimit.fill("15000");
  await volatility.fill("0.1");
  await run.click();
  const original = await simulationResults(page);
  const invariantRecovery = await page.getByText(/A 50% loss requires/).innerText();

  await capital.fill("200000");
  await run.click();
  const moreCapital = await simulationResults(page);
  expect(moreCapital[0]).toBe(original[0]);
  expect(moreCapital[1]).not.toBe(original[1]);

  await lossLimit.fill("5000");
  await run.click();
  const tighterLimit = await simulationResults(page);
  expect(tighterLimit[0]).toBe(moreCapital[0]);
  expect(tighterLimit[1]).not.toBe(moreCapital[1]);

  await leverage.fill("4");
  await run.click();
  const lowerLeverage = await simulationResults(page);
  expect(lowerLeverage).not.toEqual(tighterLimit);

  await volatility.fill("0.05");
  await run.click();
  const lowerVolatility = await simulationResults(page);
  expect(lowerVolatility).not.toEqual(lowerLeverage);

  await expect(page.getByText("Fixed recovery math: these percentages do not depend on the simulation inputs.")).toBeVisible();
  expect(await page.getByText(/A 50% loss requires/).innerText()).toBe(invariantRecovery);
});
