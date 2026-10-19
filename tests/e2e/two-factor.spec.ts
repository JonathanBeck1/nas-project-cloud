import { expect, test } from "@playwright/test";
import { e2eOwner, unusedTotpCode } from "../helpers/e2eAuth";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signing in takes the password, then a code from the authenticator", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(e2eOwner.email);
    await page.getByLabel("Password").fill(e2eOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Two-factor check" })).toBeVisible();
    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "invalid code" })).toBeVisible();

    await page.getByLabel("Authentication code").fill(await unusedTotpCode());
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  });
});

test("Settings shows two-factor on with ten recovery codes", async ({ page }) => {
  await page.goto("/settings");

  const card = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(card).toContainText("10 of 10 recovery codes left.");
});

test("an enrolled account can't reopen enrollment", async ({ page }) => {
  await page.goto("/two-factor");
  await expect(page).toHaveURL(/\/settings$/);
});
