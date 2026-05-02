import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

const owner = {
  email: "owner@example.local",
  name: "Owner",
  password: "long-enough-password",
  deviceName: "Playwright"
};

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("workspace renders the local library shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search files" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
});

test("uploads selects and downloads a file", async ({ page }, testInfo) => {
  await page.goto("/");

  const contents = "phase two";
  const filename = `phase-two-smoke-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Drop files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(contents)
  });

  await expect(page.getByRole("button", { name: filename })).toBeVisible();
  await page.getByRole("button", { name: filename }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(filename);
  await expect(download.failure()).resolves.toBeNull();

  const downloadPath = testInfo.outputPath(filename);
  await download.saveAs(downloadPath);
  await expect(fs.readFile(downloadPath, "utf8")).resolves.toBe(contents);
});

test("uploads selects and archives a file", async ({ page }) => {
  await page.goto("/");

  const filename = `archive-smoke-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Drop files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("archive me")
  });

  await expect(page.getByRole("button", { name: filename })).toBeVisible();
  await page.getByRole("button", { name: filename }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();

  await expect(page.getByRole("button", { name: filename })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: `Archived ${filename}` })).toBeVisible();
});

async function authenticate(page: import("@playwright/test").Page) {
  const setup = await page.request.post("/api/auth/setup", {
    data: owner
  });

  if (setup.status() === 201) {
    return;
  }

  const login = await page.request.post("/api/auth/login", {
    data: {
      email: owner.email,
      password: owner.password,
      deviceName: owner.deviceName
    }
  });
  expect(login.status()).toBe(200);
}
