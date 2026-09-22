import { expect, test } from "@playwright/test";

// Only download and ZIP responses ever set security headers. Every app page --
// login, setup, the workspace, the share download page -- was served bare, so
// nothing stopped the app being framed, and the Referer on /shares/<token>
// leaked the token to any link the recipient clicked.
const owner = {
  email: "owner@example.local",
  name: "Owner",
  password: process.env.E2E_OWNER_PASSWORD ?? "local-e2e-password-0000",
  deviceName: "Playwright"
};

test("app pages carry security headers", async ({ page }) => {
  const response = await page.request.get("/login");

  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // Share tokens live in the URL path, so a Referer on an outbound click hands
  // the token to a third party.
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toBeTruthy();

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("form-action 'self'");
});

test("the theme bootstrap script still runs under the page CSP", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // A script-src directive here would block the inline theme bootstrap in
  // layout.tsx; the chosen subset deliberately omits it.
  expect(errors.filter((text) => /content security policy/i.test(text))).toEqual([]);
});

test("downloads keep their stricter headers", async ({ page }) => {
  await authenticate(page);
  await page.goto("/");

  const filename = `headers-smoke-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Choose files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("header check")
  });
  await expect(page.getByRole("button", { name: filename })).toBeVisible();

  const listed = await page.request.get("/api/files");
  expect(listed.status()).toBe(200);
  const { files } = (await listed.json()) as { files: { id: string; name: string }[] };
  const uploaded = files.find((file) => file.name === filename);
  expect(uploaded).toBeDefined();

  const download = await page.request.get(`/api/files/${uploaded!.id}/download`);
  expect(download.status()).toBe(200);
  const headers = download.headers();

  // The global page policy must not relax this one.
  expect(headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["content-disposition"]).toContain(`filename="${filename}"`);
});

async function authenticate(page: import("@playwright/test").Page) {
  const setup = await page.request.post("/api/auth/setup", { data: owner });
  if (setup.status() === 201) {
    return;
  }

  const login = await page.request.post("/api/auth/login", {
    data: { email: owner.email, password: owner.password, deviceName: owner.deviceName }
  });
  expect(login.status()).toBe(200);
}
