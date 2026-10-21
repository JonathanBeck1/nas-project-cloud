import { expect, test, type Page } from "@playwright/test";
import { base32Decode, totp } from "../../src/lib/server/auth/totp";

async function csrf(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((candidate) => candidate.name === "nas_cloud_csrf");
  return decodeURIComponent(cookie?.value ?? "");
}

test("an invited member joins, can only browse a project they view, and is locked out when disabled", async ({
  page,
  browser
}) => {
  await page.goto("/people");
  await page.getByLabel("Role for the invite").selectOption("member");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const inviteLink = (await page.getByTestId("invite-link").textContent()) ?? "";
  expect(inviteLink).toContain("/invite/");

  const member = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const memberPage = await member.newPage();
  await memberPage.goto(inviteLink);
  await expect(memberPage.getByRole("heading", { name: "Create Your Account" })).toBeVisible();
  await memberPage.getByLabel("Email").fill("teammate@example.local");
  await memberPage.getByLabel("Name", { exact: true }).fill("Teammate");
  await memberPage.getByLabel("Password").fill("teammate-password-0000");
  await memberPage.getByRole("button", { name: "Create account" }).click();

  await expect(memberPage.getByRole("heading", { name: "Set up two-factor" })).toBeVisible();
  const secret = (await memberPage.getByTestId("totp-secret").textContent()) ?? "";
  await memberPage.getByLabel("Authentication code").fill(totp(base32Decode(secret)));
  await memberPage.getByRole("button", { name: "Turn on two-factor" }).click();
  await memberPage.getByRole("button", { name: "I saved them, continue" }).click();
  await expect(memberPage.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "New Project" })).toHaveCount(0);
  await expect(memberPage.getByRole("link", { name: "People" })).toHaveCount(0);

  const projectName = `Team Project ${Date.now()}`;
  const created = await page.request.post("/api/projects", {
    headers: { "x-nas-csrf": await csrf(page) },
    data: { name: projectName }
  });
  const { project } = (await created.json()) as { project: { id: string; slug: string } };
  await page.goto(`/projects/${project.id}`);
  await page.getByLabel("Person to add").selectOption({ label: "Teammate (teammate@example.local)" });
  await page.getByLabel("Access for the new member").selectOption("view");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "Project members" })).toContainText("Teammate");

  const query = new URLSearchParams({ filename: "site-plan.txt", sourceDevice: "Mac", projectId: project.id, projectSlug: project.slug });
  const upload = await page.request.post(`/api/files?${query}`, {
    headers: { "x-nas-csrf": await csrf(page) },
    data: Buffer.from("site plan")
  });
  expect(upload.status()).toBe(201);

  await memberPage.goto("/projects");
  await memberPage.getByRole("link", { name: projectName }).first().click();
  await expect(memberPage.getByText("View only: browse and download")).toBeVisible();
  await expect(memberPage.getByText("Choose files")).toHaveCount(0);
  const sitePlan = memberPage.getByRole("button", { name: "site-plan.txt" });
  // On a cold dev server the first click can land before the page hydrates.
  await expect(async () => {
    await sitePlan.click();
    await expect(sitePlan).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass();
  await expect(memberPage.getByRole("link", { name: "Download", exact: true })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "Archive" })).toHaveCount(0);

  await page.goto("/people");
  await page.getByRole("listitem").filter({ hasText: "teammate@example.local" }).getByRole("button", { name: "Disable" }).click();
  await expect(page.getByRole("status")).toContainText("disabled");

  await memberPage.goto("/projects");
  await expect(memberPage).toHaveURL(/\/login$/);
  await member.close();
});
