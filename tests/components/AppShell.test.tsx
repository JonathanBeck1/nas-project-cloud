import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/workspace/AppShell";

describe("AppShell", () => {
  it("renders the primary workspace landmarks and navigation entries", () => {
    render(<AppShell />);

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Projects")).toBeVisible();
    expect(screen.getByText("Local Library")).toBeVisible();
    expect(
      screen.getByText("Drop files here to move them onto the NAS now and organize them into projects when ready.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New Project" })).toBeVisible();
  });
});
