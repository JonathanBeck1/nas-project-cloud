import { expect, test } from "@playwright/test";

const owner = {
  email: "owner@example.local",
  name: "Owner",
  password: process.env.E2E_OWNER_PASSWORD ?? "local-e2e-password-0000",
  deviceName: "Playwright"
};

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("project workspace route renders", async ({ page }) => {
  const project = await createProject(page, `Garage Build ${Date.now()}`);

  await page.goto(`/projects/${project.id}`);

  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search project files" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download project ZIP" })).toHaveAttribute(
    "href",
    `/api/projects/${project.id}/download`
  );
});

test("uploads a file directly into a project workspace", async ({ page }) => {
  const project = await createProject(page, `Project Upload ${Date.now()}`);
  await page.goto(`/projects/${project.id}`);

  const filename = `project-upload-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Choose files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("project file")
  });

  await expect(page.getByRole("status").filter({ hasText: `Uploaded ${filename}` })).toBeVisible();
  await expect(page.getByRole("button", { name: filename })).toBeVisible();
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

async function readCsrfCookie(page: import("@playwright/test").Page): Promise<string> {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((candidate) => candidate.name === "nas_cloud_csrf");
  expect(cookie?.value).toBeTruthy();
  return cookie!.value;
}

async function createProject(page: import("@playwright/test").Page, name: string): Promise<{ id: string; name: string }> {
  const csrf = await readCsrfCookie(page);
  const response = await page.request.post("/api/projects", {
    headers: { "x-nas-csrf": csrf },
    data: { name, description: "Parts" }
  });
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as { project: { id: string; name: string } };
  return payload.project;
}
