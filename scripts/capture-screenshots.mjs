#!/usr/bin/env node
// Boots an isolated dev server, seeds it with sample data, and captures
// the workspace, project, archive, and devices surfaces as PNGs in
// docs/screenshots/. Idempotent — wipes any prior .data/screenshots dir.
//
// Usage: npm run screenshots

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, ".data", "screenshots");
const dbPath = path.join(dataDir, "nas-cloud.sqlite");
const storageRoot = path.join(dataDir, "storage");
const screenshotsDir = path.join(repoRoot, "docs", "screenshots");

const port = 3200;
const baseUrl = `http://127.0.0.1:${port}`;
const owner = {
  email: "demo@nas-cloud.local",
  name: "Demo Owner",
  password: "demo-screenshots-0000",
  deviceName: "MacBook Pro"
};

const viewport = { width: 1440, height: 900 };

async function main() {
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  console.log("starting next dev server on", baseUrl);
  const server = spawn("npm", ["run", "dev"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NAS_CLOUD_DB_PATH: dbPath,
      NAS_CLOUD_STORAGE_ROOT: storageRoot,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1"
    },
    stdio: ["ignore", "inherit", "inherit"]
  });

  let killed = false;
  const cleanup = async () => {
    if (killed) return;
    killed = true;
    server.kill("SIGTERM");
    await sleep(500);
    if (!server.killed) server.kill("SIGKILL");
  };
  process.on("SIGINT", () => cleanup().then(() => process.exit(130)));
  process.on("SIGTERM", () => cleanup().then(() => process.exit(143)));

  try {
    await waitForServer(baseUrl, 90_000);
    console.log("server ready, seeding data");

    const cookieJar = new CookieJar();
    await setupOwner(cookieJar);
    const projects = await createProjects(cookieJar);
    await uploadFixtureFiles(cookieJar, projects);

    console.log("launching chromium");
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport,
      baseURL: baseUrl,
      deviceScaleFactor: 1
    });
    await context.addCookies(cookieJar.asPlaywrightCookies("127.0.0.1"));
    const page = await context.newPage();

    await captureWorkspaceScreenshots(page, projects);

    await browser.close();
    console.log("screenshots written to", path.relative(repoRoot, screenshotsDir));
  } finally {
    await cleanup();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) {
        return;
      }
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`server never started: ${lastError?.message ?? "unknown"}`);
}

async function setupOwner(jar) {
  const response = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(owner)
  });
  if (response.status !== 201) {
    throw new Error(`auth/setup failed with ${response.status}: ${await response.text()}`);
  }
  jar.absorb(response.headers);
}

async function createProjects(jar) {
  const seeds = [
    { name: "Garden Shed Build", description: "Foundation, framing, roof. Photos and CAD." },
    { name: "Quadcopter Frame v3", description: "STLs, BOMs, and flight log video." }
  ];
  const created = [];
  for (const seed of seeds) {
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: jar.cookieHeader() },
      body: JSON.stringify(seed)
    });
    if (response.status !== 201) {
      throw new Error(`projects create failed: ${await response.text()}`);
    }
    const body = await response.json();
    created.push(body.project);
  }
  return created;
}

async function uploadFixtureFiles(jar, projects) {
  const [shed, quad] = projects;

  const files = [
    {
      name: "shed-foundation-trench.jpg",
      bytes: await renderJpg(800, 600, "Garden Shed", "Foundation trench, west side"),
      mimeType: "image/jpeg",
      project: shed
    },
    {
      name: "shed-frame-day-1.jpg",
      bytes: await renderJpg(800, 600, "Garden Shed", "Wall framing, day 1"),
      mimeType: "image/jpeg",
      project: shed
    },
    {
      name: "shed-rafter-detail.jpg",
      bytes: await renderJpg(800, 600, "Garden Shed", "Rafter joinery"),
      mimeType: "image/jpeg",
      project: shed
    },
    {
      name: "shed-bom.txt",
      bytes: Buffer.from(
        "Garden Shed Bill of Materials\n" +
          "------------------------------\n" +
          "2x4x8 SPF .................... 24\n" +
          "2x6x12 SPF ................... 8\n" +
          "OSB 4x8 sheathing ............ 12\n" +
          "30# felt roll ................ 1\n" +
          "Galvanized roof screws box ... 2\n",
        "utf8"
      ),
      mimeType: "text/plain",
      project: shed
    },
    {
      name: "quadcopter-frame-v3.stl",
      bytes: Buffer.alloc(48 * 1024, 0x20),
      mimeType: "model/stl",
      project: quad
    },
    {
      name: "quadcopter-bom.txt",
      bytes: Buffer.from(
        "Quadcopter v3 BOM\n-----------------\nMotor x 4\nESC x 4\nFC x 1\nFrame x 1\n",
        "utf8"
      ),
      mimeType: "text/plain",
      project: quad
    },
    {
      name: "trip-photos-archive.jpg",
      bytes: await renderJpg(800, 600, "Inbox", "Trip photos waiting to be sorted"),
      mimeType: "image/jpeg",
      project: null,
      archive: true
    },
    {
      name: "scan-receipt-2026-04.jpg",
      bytes: await renderJpg(800, 600, "Inbox", "Hardware store receipt — April 2026"),
      mimeType: "image/jpeg",
      project: null
    },
    {
      name: "garage-cleanout.txt",
      bytes: Buffer.from("Garage cleanout checklist\n- Donate paint cans\n- Move bikes\n", "utf8"),
      mimeType: "text/plain",
      project: null
    }
  ];

  for (const file of files) {
    const form = new FormData();
    form.set(
      "file",
      new File([file.bytes], file.name, { type: file.mimeType })
    );
    form.set("sourceDevice", "MacBook Pro");
    if (file.project) {
      form.set("projectId", file.project.id);
      form.set("projectSlug", file.project.slug);
    }

    const response = await fetch(`${baseUrl}/api/files`, {
      method: "POST",
      headers: { Cookie: jar.cookieHeader() },
      body: form
    });
    if (response.status !== 201) {
      throw new Error(`upload failed for ${file.name}: ${await response.text()}`);
    }
    const body = await response.json();
    if (file.archive) {
      const archiveResponse = await fetch(`${baseUrl}/api/files/${body.file.id}/archive`, {
        method: "POST",
        headers: { Cookie: jar.cookieHeader() }
      });
      if (archiveResponse.status !== 200) {
        throw new Error(`archive failed: ${await archiveResponse.text()}`);
      }
    }
  }

  // Give the preview worker a beat to generate thumbnails.
  await sleep(2000);
}

async function captureWorkspaceScreenshots(page, projects) {
  const targets = [
    { route: "/", file: "workspace.png", waitFor: "Inbox" },
    { route: "/projects", file: "projects.png", waitFor: "Projects" },
    { route: `/projects/${projects[0].id}`, file: "project.png", waitFor: projects[0].name },
    { route: "/archive", file: "archive.png", waitFor: "Archive" },
    { route: "/devices", file: "devices.png", waitFor: "Trusted devices" }
  ];

  for (const target of targets) {
    console.log("  capturing", target.route);
    await page.goto(target.route, { waitUntil: "networkidle" });
    if (target.waitFor) {
      await page
        .getByText(target.waitFor)
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    }
    // Let any lazy images settle.
    await sleep(400);
    await page.screenshot({
      path: path.join(screenshotsDir, target.file),
      fullPage: false,
      animations: "disabled"
    });
  }
}

async function renderJpg(width, height, title, subtitle) {
  const palette = stableHash(title + subtitle);
  const r = 30 + (palette % 60);
  const g = 80 + ((palette >> 3) % 80);
  const b = 130 + ((palette >> 7) % 80);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgb(${r},${g},${b})" />
          <stop offset="100%" stop-color="rgb(${Math.min(r + 60, 255)},${Math.min(g + 40, 255)},${Math.min(b + 80, 255)})" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)" />
      <text x="60" y="${height / 2 - 20}" font-family="Helvetica, Arial, sans-serif" font-size="56" fill="rgba(255,255,255,0.95)" font-weight="700">${escapeXml(title)}</text>
      <text x="60" y="${height / 2 + 40}" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.85)">${escapeXml(subtitle)}</text>
    </svg>
  `;

  return await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stableHash(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const setCookie = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
    for (const raw of setCookie) {
      const [pair] = raw.split(";");
      const [name, value] = pair.split("=");
      if (name && value !== undefined) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  asPlaywrightCookies(domain) {
    return [...this.cookies.entries()].map(([name, value]) => ({
      name,
      value,
      domain,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax"
    }));
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
