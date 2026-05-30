import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsCard } from "@/components/workspace/ProjectSettingsCard";
import type { Category, Project } from "@/lib/shared/types";

const router = {
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => router
}));

const project: Project = {
  id: "proj_garage",
  name: "Garage Build",
  slug: "garage-build",
  description: "Phase 1 framing.",
  categoryId: null,
  status: "active",
  createdAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z"
};

const cad: Category = {
  id: "cat_cad",
  name: "CAD",
  slug: "cad",
  color: "#0F62FE",
  isSystem: true,
  sortOrder: 1
};

describe("ProjectSettingsCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(router).forEach((fn) => (fn as { mockClear?: () => void }).mockClear?.());
  });

  it("submits a status change via PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ project: { ...project, status: "complete" } }), { status: 200 })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectSettingsCard project={project} categories={[cad]} fileCount={4} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Status"), "complete");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj_garage",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "complete" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Project updated");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("requires the user to type the project name to enable delete", async () => {
    const user = userEvent.setup();

    render(<ProjectSettingsCard project={project} categories={[cad]} fileCount={0} />);

    const deleteButton = screen.getByRole("button", { name: "Delete project" });
    expect(deleteButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type/), "Garage Build");
    expect(deleteButton).toBeEnabled();
  });

  it("issues DELETE and redirects when confirmation matches", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, detachedFiles: 2 }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectSettingsCard project={project} categories={[cad]} fileCount={2} />);

    await user.type(screen.getByLabelText(/Type/), "Garage Build");
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj_garage",
        expect.objectContaining({ method: "DELETE" })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/Deleted Garage Build/);
    expect(router.push).toHaveBeenCalledWith("/projects");
  });

  it("sends the selected file handling mode when deleting a project", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, detachedFiles: 2, movedFiles: 2 }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectSettingsCard project={project} categories={[cad]} fileCount={2} />);

    await user.click(screen.getByLabelText("Move files back to inbox"));
    await user.type(screen.getByLabelText(/Type/), "Garage Build");
    await user.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj_garage",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ fileAction: "moveToInbox" })
        })
      )
    );
  });
});
