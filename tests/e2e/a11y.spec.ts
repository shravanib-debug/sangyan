import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility and contrast checks", () => {
  test("Home page should not have any automatically detectable accessibility issues", async ({ page }) => {
    await page.goto("/");
    // We expect zero a11y violations
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Settings page should not have any automatically detectable accessibility issues", async ({ page }) => {
    await page.goto("/settings");
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("Simulator page should not have any automatically detectable accessibility issues", async ({ page }) => {
    await page.goto("/simulator");
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
