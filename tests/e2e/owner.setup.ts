import { expect, test as setup } from "@playwright/test";
import { base32Decode, totp } from "../../src/lib/server/auth/totp";
import { e2eOwner, ownerStatePath } from "../helpers/e2eAuth";
import { readSetupCode } from "../helpers/setupCode";

setup("create the owner and enroll two-factor through the UI", async ({ page }) => {
  const created = await page.request.post("/api/auth/setup", { data: { ...e2eOwner, setupCode: readSetupCode() } });
  expect(created.status()).toBe(201);

  // A new account can reach nothing but enrollment.
  await page.goto("/");
  await expect(page).toHaveURL(/\/two-factor$/);
  await expect(page.getByRole("heading", { name: "Set up two-factor" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();

  const secret = (await page.getByTestId("totp-secret").textContent()) ?? "";
  await page.getByLabel("Authentication code").fill(totp(base32Decode(secret)));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();

  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "I saved them, continue" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();

  await page.context().storageState({ path: ownerStatePath });
});
