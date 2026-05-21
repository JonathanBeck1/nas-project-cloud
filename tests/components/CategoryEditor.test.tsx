import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryEditor } from "@/components/workspace/CategoryEditor";
import type { Category } from "@/lib/shared/types";

const inbox: Category = {
  id: "cat_inbox",
  name: "Inbox",
  slug: "inbox",
  color: "#525252",
  isSystem: true,
  sortOrder: 0
};

const reference: Category = {
  id: "cat_reference",
  name: "Reference",
  slug: "reference",
  color: "#0F62FE",
  isSystem: false,
  sortOrder: 100
};

describe("CategoryEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new custom category", async () => {
    const user = userEvent.setup();
    const created: Category = {
      id: "cat_workshop",
      name: "Workshop",
      slug: "workshop",
      color: "#FF6F00",
      isSystem: false,
      sortOrder: 110
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ category: created }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryEditor categories={[inbox, reference]} usage={[]} />);

    await user.type(screen.getByLabelText("Name"), "Workshop");
    await user.click(screen.getByLabelText("Use color #FF6F00"));
    await user.click(screen.getByRole("button", { name: "Create category" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/categories",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Workshop", color: "#FF6F00" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Created Workshop");
    expect(screen.getByText("Workshop")).toBeVisible();
  });

  it("renames and recolors an existing custom category", async () => {
    const user = userEvent.setup();
    const updated: Category = { ...reference, name: "References", color: "#42BE65" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ category: updated }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CategoryEditor categories={[inbox, reference]} usage={[]} />);

    await user.click(screen.getByRole("button", { name: "Edit Reference" }));
    const nameField = screen.getByLabelText("Category name");
    await user.clear(nameField);
    await user.type(nameField, "References");
    await user.click(screen.getByRole("button", { name: "Save Reference" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/categories/cat_reference",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Updated References");
  });

  it("does not render edit or delete affordances on system categories", () => {
    render(<CategoryEditor categories={[inbox, reference]} usage={[]} />);

    expect(screen.queryByRole("button", { name: "Edit Inbox" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Inbox" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Reference" })).toBeVisible();
  });

  it("deletes a custom category after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CategoryEditor
        categories={[inbox, reference]}
        usage={[{ categoryId: "cat_reference", fileCount: 4 }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Reference" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete the "Reference" category? 4 files will become uncategorized.'
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/categories/cat_reference", { method: "DELETE" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted Reference");
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
  });
});
