import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileFamily } from "@/lib/shared/types";

const mocks = vi.hoisted(() => {
  const repo = {
    listFiles: vi.fn(),
    createFile: vi.fn(),
    getFileById: vi.fn()
  };
  const storage = {
    writeUpload: vi.fn(),
    absolutePathFor: vi.fn()
  };

  return {
    appConfig: {
      maxUploadBytes: 10,
      storageRoot: ""
    },
    db: {},
    repo,
    storage,
    classifyFile: vi.fn()
  };
});

const createdDirs: string[] = [];

vi.mock("@/lib/server/config", () => ({
  appConfig: mocks.appConfig
}));

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => mocks.db)
}));

vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: vi.fn(() => mocks.repo)
}));

vi.mock("@/lib/server/storage", () => ({
  createStorageService: vi.fn(() => mocks.storage)
}));

vi.mock("@/lib/shared/fileTypes", () => ({
  classifyFile: mocks.classifyFile
}));

describe("files API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appConfig.maxUploadBytes = 10;
    mocks.appConfig.storageRoot = os.tmpdir();
    mocks.repo.listFiles.mockReturnValue([]);
    mocks.repo.getFileById.mockReturnValue(null);
    mocks.repo.createFile.mockImplementation((input) => ({
      id: "file_1",
      uploadedAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
      tags: [],
      ...input
    }));
    mocks.storage.writeUpload.mockResolvedValue({
      absolutePath: "/storage/Inbox/Mac/part.stl",
      relativePath: "Inbox/Mac/part.stl",
      sizeBytes: 5,
      checksum: "checksum",
      mimeType: "model/stl"
    });
    mocks.storage.absolutePathFor.mockImplementation((relativePath: string) =>
      path.join(mocks.appConfig.storageRoot, relativePath)
    );
    mocks.classifyFile.mockReturnValue({
      extension: "stl",
      family: "cad" as FileFamily
    });
  });

  afterEach(() => {
    while (createdDirs.length > 0) {
      fs.rmSync(createdDirs.pop()!, { force: true, recursive: true });
    }
  });

  it("passes GET filters to the repository", async () => {
    const { GET } = await import("@/app/api/files/route");
    const files = [{ id: "file_1" }];
    mocks.repo.listFiles.mockReturnValue(files);

    const response = await GET(
      new Request("http://localhost/api/files?query=bracket&projectId=proj_1&categoryId=cat_1")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ files });
    expect(mocks.repo.listFiles).toHaveBeenCalledWith({
      query: "bracket",
      projectId: "proj_1",
      categoryId: "cat_1"
    });
  });

  it("returns file detail by id", async () => {
    const { GET } = await import("@/app/api/files/[id]/route");
    const file = {
      id: "file_123",
      name: "manual.pdf",
      storagePath: "Inbox/Browser/manual.pdf"
    };
    mocks.repo.getFileById.mockReturnValue(file);

    const response = await GET(new Request("http://localhost/api/files/file_123"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ file });
  });

  it("streams a file download with safe headers", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain('filename="manual.pdf"');
    await expect(response.text()).resolves.toBe("manual");
  });

  it("returns 404 when downloading an archived file", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "archived",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
  });

  it("returns 404 when the download file is missing on disk", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
  });

  it("returns 400 when POST is missing a file", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(formRequest({ sourceDevice: "Mac" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "file is required" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("rejects oversized Content-Length before parsing the body", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      new Request("http://localhost/api/files", {
        method: "POST",
        headers: {
          "content-length": "11",
          "content-type": "multipart/form-data; boundary=broken"
        },
        body: "this is not valid multipart data"
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "file exceeds upload size limit" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("returns 400 when form data cannot be parsed", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      new Request("http://localhost/api/files", {
        method: "POST",
        headers: {
          "content-length": "9",
          "content-type": "multipart/form-data; boundary=broken"
        },
        body: "not-valid"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid form data" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("stores inbox uploads under the source device and records inbox metadata", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        categoryId: "cat_1"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.storage.writeUpload).toHaveBeenCalledWith({
      target: { kind: "inbox", sourceDevice: "Mac" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("hello")
    });
    expect(mocks.repo.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "part.stl",
        projectId: null,
        categoryId: "cat_1",
        sourceDevice: "Mac",
        storagePath: "Inbox/Mac/part.stl"
      })
    );
  });

  it("stores project uploads under projectSlug and records projectId metadata", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        projectId: "proj_1",
        projectSlug: "garage-build"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.storage.writeUpload).toHaveBeenCalledWith({
      target: { kind: "project", projectSlug: "garage-build" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("hello")
    });
    expect(mocks.repo.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        sourceDevice: "Mac",
        storagePath: "Inbox/Mac/part.stl"
      })
    );
  });

  it.each([
    ["projectId", { projectId: "proj_1" }],
    ["projectSlug", { projectSlug: "garage-build" }]
  ])("rejects project uploads with only %s", async (_label, fields) => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        ...fields
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "projectId and projectSlug must be provided together"
    });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });
});

function formRequest(fields: {
  file?: File;
  sourceDevice?: string;
  projectId?: string;
  projectSlug?: string;
  categoryId?: string;
}) {
  const formData = new FormData();

  if (fields.file) {
    formData.set("file", fields.file);
  }

  for (const field of ["sourceDevice", "projectId", "projectSlug", "categoryId"] as const) {
    const value = fields[field];
    if (value !== undefined) {
      formData.set(field, value);
    }
  }

  const request = new Request("http://localhost/api/files", {
    method: "POST"
  });
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

function uploadFile(contents: string) {
  const bytes = Buffer.from(contents);
  const file = new File([contents], "part.stl", { type: "model/stl" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  });
  return file;
}
