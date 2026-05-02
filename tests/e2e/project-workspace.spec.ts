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

test("project workspace route renders", async ({ page }) => {
  const response = await page.request.post("/api/projects", {
    data: { name: `Garage Build ${Date.now()}`, description: "Parts" }
  });
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as { project: { id: string; name: string } };

  await page.goto(`/projects/${payload.project.id}`);

  await expect(page.getByRole("heading", { name: payload.project.name })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search project files" })).toBeVisible();
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
