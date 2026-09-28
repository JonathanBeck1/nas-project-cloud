import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "@/components/workspace/BulkActionBar";
import type { Category, Project } from "@/lib/shared/types";

const projects = [{ id: "proj_drone", name: "Drone" }] as Project[];
const categories = [{ id: "cat_cad", name: "3D / CAD" }] as Category[];

function renderBar(onApplyOrganization = vi.fn(), selectedCount = 2) {
  const view = render(
    <BulkActionBar
      selectedCount={selectedCount}
      projects={projects}
      categories={categories}
      onArchive={vi.fn()}
      onApplyOrganization={onApplyOrganization}
      onClearSelection={vi.fn()}
    />
  );
  return { onApplyOrganization, ...view };
}

describe("BulkActionBar", () => {
  it("shows selected count and core bulk actions", () => {
    render(<BulkActionBar selectedCount={3} onArchive={vi.fn()} onClearSelection={vi.fn()} />);

    expect(screen.getByText("3 selected")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Download ZIP" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeVisible();
  });

  it("shows a bulk zip download link when provided", () => {
    render(
      <BulkActionBar
        selectedCount={2}
        downloadHref="/api/files/bulk/download?fileIds=file_1&fileIds=file_2"
        onArchive={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: "Download ZIP" })).toHaveAttribute(
      "href",
      "/api/files/bulk/download?fileIds=file_1&fileIds=file_2"
    );
  });

  it("keeps both project and category by default and only enables Apply once something changes", () => {
    renderBar();

    expect(screen.getByLabelText("Project for selected files")).toHaveDisplayValue("Keep current project");
    expect(screen.getByLabelText("Category for selected files")).toHaveDisplayValue("Keep current category");
    expect(screen.getByRole("button", { name: "Apply organization" })).toBeDisabled();
  });

  it("sends only the category when only the category changed", async () => {
    const user = userEvent.setup();
    const { onApplyOrganization } = renderBar();

    await user.selectOptions(screen.getByLabelText("Category for selected files"), "cat_cad");
    await user.click(screen.getByRole("button", { name: "Apply organization" }));

    expect(onApplyOrganization).toHaveBeenCalledWith({ categoryId: "cat_cad" });
  });

  it("sends null only when Inbox or Unsorted is picked on purpose", async () => {
    const user = userEvent.setup();
    const { onApplyOrganization } = renderBar();

    await user.selectOptions(screen.getByLabelText("Project for selected files"), "Inbox (no project)");
    await user.selectOptions(screen.getByLabelText("Category for selected files"), "Unsorted");
    await user.click(screen.getByRole("button", { name: "Apply organization" }));

    expect(onApplyOrganization).toHaveBeenCalledWith({ projectId: null, categoryId: null });
  });

  it("goes back to keeping both once the selection is cleared", async () => {
    const user = userEvent.setup();
    const { rerender } = renderBar();
    await user.selectOptions(screen.getByLabelText("Project for selected files"), "Inbox (no project)");
    await user.selectOptions(screen.getByLabelText("Category for selected files"), "cat_cad");

    const bar = (selectedCount: number) => (
      <BulkActionBar
        selectedCount={selectedCount}
        projects={projects}
        categories={categories}
        onArchive={vi.fn()}
        onApplyOrganization={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );
    rerender(bar(0));
    rerender(bar(3));

    expect(screen.getByLabelText("Project for selected files")).toHaveDisplayValue("Keep current project");
    expect(screen.getByLabelText("Category for selected files")).toHaveDisplayValue("Keep current category");
    expect(screen.getByRole("button", { name: "Apply organization" })).toBeDisabled();
  });
});
