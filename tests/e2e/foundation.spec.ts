import { expect, test } from "@playwright/test";

test("loads the installable Phase 0 shell", async ({ page }) => {
  const response = await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pause");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
});
