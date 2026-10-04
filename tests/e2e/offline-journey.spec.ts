import { expect, test, type Page } from "@playwright/test";

async function queuedItems(page: Page): Promise<Array<{ entityType: string; syncStatus: string }>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("thehrav");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("syncQueue").objectStore("syncQueue").getAll();
          request.onsuccess = () => resolve(request.result as Array<{ entityType: string; syncStatus: string }>);
          request.onerror = () => reject(request.error);
        };
      })
  );
}

test("the whole manual journey runs offline after the first load", async ({ page, context }) => {
  // First successful load installs the service worker and precaches the core routes.
  await page.goto("/home");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Pause");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "offline" })).toBeVisible();

  // Onboarding as a guest.
  await page.getByRole("link", { name: "Start onboarding" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("sees broker activity only after it happens")).toBeVisible();
  await page.getByRole("button", { name: "I understand and accept" }).click();
  await page.getByRole("button", { name: /Continue as Guest/ }).click();

  // Pact: first save is immediate.
  await expect(page.getByRole("heading", { name: "My Pact" })).toBeVisible();
  await page.getByRole("button", { name: "Save Pact" }).click();
  await expect(page.getByText("Saved. Your tighter rules apply now.")).toBeVisible();

  // Loosening is held back: the active rules stay, and a countdown appears.
  await page.getByLabel("Max Trades per Day").fill("9");
  await page.getByRole("button", { name: "Save Pact" }).click();
  await expect(page.getByText("Saved. Your looser rules apply after 24 hours.")).toBeVisible();
  await expect(page.getByText(/Loosening in 23h/)).toBeVisible();

  // Check-in with borrowed money: the explicitly saved source block creates an L3 Pact lock.
  await page.getByRole("link", { name: "Go to check-in" }).click();
  await page.getByLabel("Trade amount (INR)").fill("25000");
  await page.getByLabel("Money source").selectOption("borrowed");
  await page.getByLabel("Type of borrowing").selectOption("instant_loan");
  await page.getByLabel("Why this trade now?").fill("I want to win back yesterday's loss");
  await page.getByLabel("What is the exit condition?").fill("None yet");
  await page.getByRole("button", { name: "Evaluate Decision" }).click();

  await expect(page.getByRole("heading", { name: "Cooling-off Pause" })).toBeVisible();
  await expect(page.getByText("L3 ·")).toBeVisible();
  await expect(page.getByText("Money source: borrowed money")).toBeVisible();
  await expect(page.getByText("Rule applied: borrowed money always gets at least a 2-minute pause.")).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("Locked by your Pact");
  await expect(page.getByRole("button", { name: "I understand, continue anyway" })).toHaveCount(0);
  await expect(page.getByText("cannot block an order")).toBeVisible();

  // A reload must not reset the countdown: it derives from the stored expiry.
  await page.reload();
  await expect(page.getByRole("timer")).toContainText(/Locked by your Pact for 2\dm/);

  // The decision is recorded locally and queued for later sync.
  await page.getByRole("button", { name: "Step away (Good call)" }).click();
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pause before the next decision");

  const queue = await queuedItems(page);
  expect(queue.map((item) => item.entityType).sort()).toEqual(["checkin", "pact", "pact", "pause", "pause"]);
  expect(queue.every((item) => item.syncStatus === "pending")).toBe(true);
});
