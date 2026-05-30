import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailDrawer } from "@/components/workspace/DetailDrawer";
import type { CloudFile, FileShareAccessEvent, FileShareLink, Project, Tag } from "@/lib/shared/types";

const fixture: CloudFile = {
  id: "file_manual",
  name: "assembly manual.pdf",
  extension: "pdf",
  family: "document",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  checksum: "sha256-manual",
  storagePath: "Inbox/Browser/assembly manual.pdf",
  projectId: null,
  categoryId: null,
  sourceDevice: "Browser",
  status: "active",
  archivedAt: null,
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: []
};

const project: Project = {
  id: "proj_123",
  name: "Print Parts",
  slug: "print-parts",
  description: "",
  categoryId: null,
  status: "active",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z"
};

const previewFixture: CloudFile = {
  ...fixture,
  id: "file_render",
  name: "render.png",
  extension: "png",
  family: "image",
  mimeType: "image/png",
  preview: {
    fileId: "file_render",
    kind: "image",
    status: "ready",
    previewPath: ".previews/images/file_render.webp",
    width: 320,
    height: 180,
    durationSeconds: null,
    error: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z"
  }
};

const shareFixture: FileShareLink = {
  id: "share_123",
  fileId: "file_manual",
  label: null,
  expiresAt: "2026-05-31T00:00:00.000Z",
  maxDownloads: null,
  passwordProtected: false,
  downloadCount: 2,
  revokedAt: null,
  createdByUserId: "user_1",
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
  lastAccessedAt: "2026-05-30T01:00:00.000Z"
};

const shareEventFixture: FileShareAccessEvent = {
  id: "event_123",
  shareId: "share_123",
  fileId: "file_manual",
  accessedAt: "2026-05-30T02:00:00.000Z",
  userAgent: "Safari on Mac",
  ipAddress: "192.168.68.10"
};

describe("DetailDrawer", () => {
  it("shows selected file storage path metadata", () => {
    render(<DetailDrawer file={fixture} />);

    expect(screen.getByText("Path")).toBeVisible();
    expect(screen.getByText("Inbox/Browser/assembly manual.pdf")).toBeVisible();
  });

  it("renders file action controls", () => {
    const onArchive = vi.fn();
    const onAssignProject = vi.fn();

    render(
      <DetailDrawer
        file={fixture}
        projects={[project]}
        onArchive={onArchive}
        onAssignProject={onAssignProject}
      />
    );

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/files/file_manual/download"
    );
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.getByLabelText("Project")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeVisible();
  });

  it("calls archive action for the selected file", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();

    render(<DetailDrawer file={fixture} projects={[]} onArchive={onArchive} onAssignProject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(onArchive).toHaveBeenCalledWith(fixture);
  });

  it("calls project assignment action with the selected project", async () => {
    const user = userEvent.setup();
    const onAssignProject = vi.fn();

    render(<DetailDrawer file={fixture} projects={[project]} onAssignProject={onAssignProject} />);

    await user.selectOptions(screen.getByLabelText("Project"), "proj_123");

    expect(onAssignProject).toHaveBeenCalledWith(fixture, "proj_123");
  });

  it("calls rename action with a trimmed filename", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(<DetailDrawer file={fixture} onRename={onRename} />);

    const input = screen.getByLabelText("File name");
    await user.clear(input);
    await user.type(input, " assembly-final.pdf ");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    expect(onRename).toHaveBeenCalledWith(fixture, "assembly-final.pdf");
  });

  it("creates and displays a share link for the selected file", async () => {
    const user = userEvent.setup();
    const onCreateShareLink = vi.fn(async () => ({
      share: shareFixture,
      url: "/api/shares/share-token/download"
    }));

    render(<DetailDrawer file={fixture} onCreateShareLink={onCreateShareLink} />);

    await user.type(screen.getByLabelText("Label"), "MacBook handoff");
    await user.selectOptions(screen.getByLabelText("Expires"), "168");
    await user.type(screen.getByLabelText("Max downloads"), "3");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create share link" }));

    expect(onCreateShareLink).toHaveBeenCalledWith(fixture, {
      expiresInHours: 168,
      maxDownloads: 3,
      label: "MacBook handoff",
      password: "correct horse"
    });
    expect(await screen.findByLabelText("Share link")).toHaveValue("/api/shares/share-token/download");
    expect(screen.getByText("2 downloads")).toBeVisible();
  });

  it("loads and revokes existing share links", async () => {
    const user = userEvent.setup();
    const labeledShare = { ...shareFixture, label: "MacBook handoff", maxDownloads: 5, passwordProtected: true };
    const onListShareLinks = vi.fn(async () => [labeledShare]);
    const onListShareAccessEvents = vi.fn(async () => [shareEventFixture]);
    const onRevokeShareLink = vi.fn(async () => ({ ...labeledShare, revokedAt: "2026-05-30T02:00:00.000Z" }));

    render(
      <DetailDrawer
        file={fixture}
        onCreateShareLink={vi.fn()}
        onListShareLinks={onListShareLinks}
        onListShareAccessEvents={onListShareAccessEvents}
        onRevokeShareLink={onRevokeShareLink}
      />
    );

    expect(await screen.findByText("MacBook handoff")).toBeVisible();
    expect(screen.getByText("2 of 5 downloads")).toBeVisible();
    expect(screen.getByText("Password protected")).toBeVisible();
    expect(screen.getByText(/Last used/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/api/files/file_manual/shares/share_123/events?format=csv"
    );
    expect(await screen.findByText("Safari on Mac")).toBeVisible();
    expect(screen.getByText("192.168.68.10")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Revoke share link" }));

    expect(onListShareAccessEvents).toHaveBeenCalledWith(fixture, labeledShare);
    expect(onRevokeShareLink).toHaveBeenCalledWith(fixture, labeledShare);
    await waitFor(() => expect(screen.queryByText("MacBook handoff")).not.toBeInTheDocument());
  });

  it("updates existing share link controls", async () => {
    const user = userEvent.setup();
    const labeledShare = { ...shareFixture, label: "MacBook handoff", maxDownloads: 5, passwordProtected: true };
    const updatedShare = { ...labeledShare, label: "Updated handoff", maxDownloads: 4 };
    const onListShareLinks = vi.fn(async () => [labeledShare]);
    const onUpdateShareLink = vi.fn(async () => updatedShare);

    render(
      <DetailDrawer
        file={fixture}
        onCreateShareLink={vi.fn()}
        onListShareLinks={onListShareLinks}
        onUpdateShareLink={onUpdateShareLink}
      />
    );

    expect(await screen.findByText("MacBook handoff")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Edit share link" }));
    await user.clear(screen.getByLabelText("Edit label"));
    await user.type(screen.getByLabelText("Edit label"), "Updated handoff");
    await user.selectOptions(screen.getByLabelText("Edit expires"), "168");
    await user.clear(screen.getByLabelText("Edit max downloads"));
    await user.type(screen.getByLabelText("Edit max downloads"), "4");
    await user.type(screen.getByLabelText("New password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Save share link" }));

    expect(onUpdateShareLink).toHaveBeenCalledWith(fixture, labeledShare, {
      label: "Updated handoff",
      expiresInHours: 168,
      maxDownloads: 4,
      password: "correct horse",
      clearPassword: false
    });
    expect(await screen.findByText("Updated handoff")).toBeVisible();
    expect(screen.getByText("2 of 4 downloads")).toBeVisible();
  });

  it("disables server-mutating actions while busy", () => {
    render(
      <DetailDrawer
        file={fixture}
        projects={[project]}
        isBusy
        onArchive={vi.fn()}
        onAssignProject={vi.fn()}
        onRename={vi.fn()}
        onCreateShareLink={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByLabelText("Project")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create share link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeEnabled();
  });

  it("renders a large preview when a ready preview exists", () => {
    render(<DetailDrawer file={previewFixture} />);

    expect(screen.getByRole("img", { name: "Preview of render.png" })).toHaveAttribute(
      "src",
      "/api/files/file_render/preview"
    );
  });

  it("shows preview processing status for pending previews", () => {
    render(<DetailDrawer file={{ ...previewFixture, preview: { ...previewFixture.preview!, status: "pending", previewPath: null } }} />);

    expect(screen.getByText("Preview")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Preview of render.png" })).not.toBeInTheDocument();
  });

  it("shows preview failure details", () => {
    render(
      <DetailDrawer
        file={{
          ...previewFixture,
          preview: { ...previewFixture.preview!, status: "failed", previewPath: null, error: "unsupported image" }
        }}
      />
    );

    expect(screen.getByText("Preview")).toBeVisible();
    expect(screen.getByText("Failed: unsupported image")).toBeVisible();
  });

  it("renders existing tag chips and allows removing one", async () => {
    const user = userEvent.setup();
    const onAssignTags = vi.fn();
    const reference: Tag = { id: "tag_ref", name: "Reference", slug: "reference" };
    const draft: Tag = { id: "tag_draft", name: "Draft", slug: "draft" };
    const tagged: CloudFile = { ...fixture, tags: [reference, draft] };

    render(
      <DetailDrawer file={tagged} availableTags={[reference, draft]} onAssignTags={onAssignTags} />
    );

    expect(screen.getByText("Reference")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove tag Reference" }));

    expect(onAssignTags).toHaveBeenCalledWith(tagged, ["tag_draft"]);
  });

  it("adds a tag through the picker without re-adding existing tags", async () => {
    const user = userEvent.setup();
    const onAssignTags = vi.fn();
    const reference: Tag = { id: "tag_ref", name: "Reference", slug: "reference" };
    const draft: Tag = { id: "tag_draft", name: "Draft", slug: "draft" };
    const tagged: CloudFile = { ...fixture, tags: [reference] };

    render(
      <DetailDrawer file={tagged} availableTags={[reference, draft]} onAssignTags={onAssignTags} />
    );

    await user.selectOptions(screen.getByLabelText("Add tag"), "tag_draft");

    expect(onAssignTags).toHaveBeenCalledWith(tagged, ["tag_ref", "tag_draft"]);
  });

  it("disables the tag picker when there are no available tags", () => {
    render(<DetailDrawer file={fixture} availableTags={[]} onAssignTags={vi.fn()} />);

    expect(screen.getByLabelText("Add tag")).toBeDisabled();
    expect(screen.getByText("No tags yet.")).toBeVisible();
  });
});
