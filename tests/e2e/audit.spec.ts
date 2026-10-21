import { expect, test } from "@playwright/test";

test("an upload shows up in the audit log and its CSV export", async ({ page }) => {
  const filename = `audited-${Date.now()}.txt`;
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByText("Choose files", { exact: true }).first().click();
  await (await chooser).setFiles({ name: filename, mimeType: "text/plain", buffer: Buffer.from("audit me") });
  await expect(page.getByRole("button", { name: filename })).toBeVisible();

  await page.goto("/audit");
  const action = page.getByLabel("Action");
  const exportLink = page.getByRole("link", { name: "Export CSV" });
  // On a cold dev server a pick made before the page hydrates is lost, so pick again until it takes.
  await expect(async () => {
    await action.selectOption("");
    await action.selectOption("file_uploaded");
    await expect(exportLink).toHaveAttribute("href", "/api/audit/export?action=file_uploaded", { timeout: 1000 });
  }).toPass();
  const entries = page.getByRole("list", { name: "Audit entries" });
  await expect(entries.getByRole("listitem").filter({ hasText: filename })).toContainText("File uploaded");

  const csv = await page.request.get("/api/audit/export?action=file_uploaded");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(filename);
});
