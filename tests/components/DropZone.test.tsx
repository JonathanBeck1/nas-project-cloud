import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropZone } from "@/components/workspace/DropZone";

describe("DropZone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads dropped files to the inbox with an accessible status", async () => {
    let resolveUpload: (response: Response) => void = () => {};
    const upload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(() => upload);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DropZone>
        <div data-testid="drop-target">Drop target</div>
      </DropZone>
    );

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("drop-target"), {
      dataTransfer: {
        files: [file]
      }
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Uploading manual.pdf");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files", expect.objectContaining({ method: "POST" })));

    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBe(file);
    expect((body as FormData).get("sourceDevice")).toBe("Browser");
    resolveUpload(new Response(JSON.stringify({ file: { id: "file_upload" } }), { status: 201 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
  });
});
