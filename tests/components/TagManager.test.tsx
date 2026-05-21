import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagManager } from "@/components/workspace/TagManager";
import type { Tag } from "@/lib/shared/types";

const reference: Tag = { id: "tag_ref", name: "Reference", slug: "reference" };
const draft: Tag = { id: "tag_draft", name: "Draft", slug: "draft" };

describe("TagManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new tag and prepends it to the list", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ tag: { id: "tag_new", name: "Inspiration", slug: "inspiration" } }),
          { status: 201 }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<TagManager tags={[reference]} usage={[{ tagId: "tag_ref", fileCount: 3 }]} />);

    await user.type(screen.getByLabelText("Tag name"), "Inspiration");
    await user.click(screen.getByRole("button", { name: "Create tag" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tags",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Inspiration" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Created Inspiration");
    expect(screen.getByText("Inspiration")).toBeVisible();
  });

  it("deletes an existing tag after confirming", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TagManager
        tags={[reference, draft]}
        usage={[
          { tagId: "tag_ref", fileCount: 2 },
          { tagId: "tag_draft", fileCount: 0 }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete tag Reference" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete the "Reference" tag? It will be removed from 2 files.'
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tags/tag_ref",
        expect.objectContaining({ method: "DELETE" })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted Reference");
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
  });

  it("aborts deletion when the user cancels the confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(<TagManager tags={[draft]} usage={[]} />);

    await user.click(screen.getByRole("button", { name: "Delete tag Draft" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
