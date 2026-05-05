import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "@/components/workspace/Sidebar";
import type { Project } from "@/lib/shared/types";

const project: Project = {
  id: "proj_123",
  name: "Printer Upgrade",
  slug: "printer-upgrade",
  description: "Printer upgrade docs",
  categoryId: null,
  status: "active",
  createdAt: "2026-05-03T00:00:00.000Z",
  updatedAt: "2026-05-03T00:00:00.000Z"
};

describe("Sidebar", () => {
  it("renders real links for every workspace destination", () => {
    const { container } = render(<Sidebar projects={[project]} activeHref="/categories" />);

    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/categories");
    expect(screen.getByRole("link", { name: "Printer Upgrade" })).toHaveAttribute("href", "/projects/proj_123");
    expect(screen.getByRole("link", { name: "Recent Uploads" })).toHaveAttribute("href", "/smart-views/recent");
    expect(screen.getByRole("link", { name: "CAD Files" })).toHaveAttribute("href", "/smart-views/cad");
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute("href", "/devices");
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("aria-current", "page");
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).not.toContain("#");
  });
});
