import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ShareDownloadPage from "@/app/shares/[token]/page";

describe("ShareDownloadPage", () => {
  it("renders a password-capable download form for recipients", async () => {
    render(await ShareDownloadPage({ params: Promise.resolve({ token: "share-token" }) }));

    const form = screen.getByRole("form", { name: "Shared file download" });
    expect(form).toHaveAttribute("action", "/api/shares/share-token/download");
    expect(form).toHaveAttribute("method", "post");
    expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: "Download file" })).toBeVisible();
  });
});
