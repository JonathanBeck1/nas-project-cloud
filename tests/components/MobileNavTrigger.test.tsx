import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MobileNavTrigger } from "@/components/workspace/MobileNavTrigger";

describe("MobileNavTrigger", () => {
  it("opens the navigation drawer when the hamburger is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNavTrigger projects={[]} activeHref="/" />);

    expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = await screen.findByRole("dialog", { name: "Workspace navigation" });
    expect(drawer).toBeVisible();
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/");
  });

  it("closes the drawer when a navigation link is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNavTrigger projects={[]} activeHref="/" />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog", { name: "Workspace navigation" });

    await user.click(screen.getByRole("link", { name: "Categories" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).not.toBeInTheDocument()
    );
  });

  it("closes the drawer when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<MobileNavTrigger projects={[]} activeHref="/" />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog", { name: "Workspace navigation" });

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Workspace navigation" })).not.toBeInTheDocument()
    );
  });
});
