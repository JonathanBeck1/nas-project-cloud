import { expect, test } from "@playwright/test";

test("setup page renders owner bootstrap form", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create Owner" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
