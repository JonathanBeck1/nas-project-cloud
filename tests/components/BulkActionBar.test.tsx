import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "@/components/workspace/BulkActionBar";

describe("BulkActionBar", () => {
  it("shows selected count and core bulk actions", () => {
    render(<BulkActionBar selectedCount={3} onArchive={vi.fn()} onClearSelection={vi.fn()} />);

    expect(screen.getByText("3 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeVisible();
  });
});
