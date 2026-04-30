import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDialog } from "@/components/workspace/ProjectDialog";

describe("ProjectDialog", () => {
  it("submits a project name and description", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(<ProjectDialog onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Project name"), "Print Parts");
    await user.type(screen.getByLabelText("Description"), "Printer upgrades");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "Print Parts", description: "Printer upgrades" });
  });

  it("trims project names before submitting", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(<ProjectDialog onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Project name"), "  Print Parts  ");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({ name: "Print Parts", description: "" });
  });

  it("does not submit blank project names and shows validation feedback", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(<ProjectDialog onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Project name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Create project" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Project name is required");
  });

  it("keeps the dialog open and shows an error when async create rejects", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error("Project service unavailable"));

    render(<ProjectDialog onCreate={onCreate} />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Project name"), "Print Parts");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Project service unavailable");
    expect(screen.getByRole("dialog", { name: "Create project" })).toBeVisible();
    expect(screen.getByLabelText("Project name")).toHaveValue("Print Parts");
  });
});
