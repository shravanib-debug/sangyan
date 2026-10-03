import { expect, test } from "@playwright/test";

test("loads the installable Phase 0 shell", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pause");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
});
