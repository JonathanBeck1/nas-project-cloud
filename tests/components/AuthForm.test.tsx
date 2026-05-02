import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth/AuthForm";

describe("AuthForm", () => {
  afterEach(() => vi.restoreAllMocks());

  it("submits setup credentials", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ user: { id: "user_1" } }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthForm mode="setup" endpoint="/api/auth/setup" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email"), "owner@example.local");
    await user.type(screen.getByLabelText("Name"), "Owner");
    await user.type(screen.getByLabelText("Password"), "long-enough-password");
    await user.type(screen.getByLabelText("Device name"), "Mac Studio");
    await user.click(screen.getByRole("button", { name: "Create owner" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/setup",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.local",
          name: "Owner",
          password: "long-enough-password",
          deviceName: "Mac Studio"
        })
      })
    );
  });
});
