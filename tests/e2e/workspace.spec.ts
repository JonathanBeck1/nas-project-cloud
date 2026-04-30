import { expect, test } from "@playwright/test";

test("workspace renders the local library shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search files" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
});
