import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileDownloadResponse } from "@/lib/server/downloadResponse";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const file = { name: "manual.pdf", mimeType: "application/pdf", storagePath: "Inbox/manual.pdf", checksum: "abc123" };

function storedFile(contents = "0123456789") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-range-"));
  createdDirs.push(dir);
  const absolutePath = path.join(dir, "manual.pdf");
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

async function download(absolutePath: string, headers: Record<string, string> = {}) {
  const response = await createFileDownloadResponse(
    new Request("http://localhost/api/files/file_1/download", { headers }),
    file,
    absolutePath
  );
  if (!response) {
    throw new Error("expected a response");
  }
  return response;
}

describe("createFileDownloadResponse ranges", () => {
  it("serves the whole file and advertises range support", async () => {
    const response = await download(storedFile());

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("etag")).toMatch(/^"abc123-/);
    expect(response.headers.get("last-modified")).toMatch(/GMT$/);
    await expect(response.text()).resolves.toBe("0123456789");
  });

  it.each([
    ["bytes=2-5", "bytes 2-5/10", "2345"],
    ["bytes=7-", "bytes 7-9/10", "789"],
    ["bytes=-3", "bytes 7-9/10", "789"],
    ["bytes=4-999", "bytes 4-9/10", "456789"],
    ["bytes=0-0", "bytes 0-0/10", "0"]
  ])("answers %s with 206 %s", async (range, contentRange, body) => {
    const response = await download(storedFile(), { range });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(contentRange);
    expect(response.headers.get("content-length")).toBe(String(body.length));
    await expect(response.text()).resolves.toBe(body);
  });

  it.each(["bytes=10-", "bytes=99-100", "bytes=-0"])("answers unsatisfiable %s with 416", async (range) => {
    const response = await download(storedFile(), { range });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
  });

  it.each(["bytes=0-1,4-5", "bytes=5-2", "items=0-1", "bytes=abc"])(
    "ignores %s and serves the whole file",
    async (range) => {
      const response = await download(storedFile(), { range });

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("0123456789");
    }
  );

  it("honors If-Range only when the validator still matches", async () => {
    const absolutePath = storedFile();
    const first = await download(absolutePath);
    const etag = first.headers.get("etag") ?? "";
    const lastModified = first.headers.get("last-modified") ?? "";
    await first.text();

    const byEtag = await download(absolutePath, { range: "bytes=5-", "if-range": etag });
    const byDate = await download(absolutePath, { range: "bytes=5-", "if-range": lastModified });
    const stale = await download(absolutePath, { range: "bytes=5-", "if-range": '"some-older-version"' });

    expect(byEtag.status).toBe(206);
    expect(byDate.status).toBe(206);
    expect(stale.status).toBe(200);
    await expect(stale.text()).resolves.toBe("0123456789");
  });

  it("changes the ETag when the bytes on disk change under the same checksum", async () => {
    const absolutePath = storedFile();
    const before = (await download(absolutePath)).headers.get("etag");
    fs.writeFileSync(absolutePath, "0123456789-edited-over-smb");
    fs.utimesSync(absolutePath, new Date(), new Date(Date.now() + 5_000));

    const after = (await download(absolutePath)).headers.get("etag");

    expect(after).not.toBe(before);
  });

  it("keeps the download hardening headers on partial responses", async () => {
    const response = await download(storedFile(), { range: "bytes=0-3" });

    expect(response.headers.get("content-disposition")).toContain('attachment; filename="manual.pdf"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
});
