import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "@/components/workspace/BulkActionBar";

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
});
