import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeviceLabelEditor } from "@/components/workspace/DeviceLabelEditor";
import { DEVICE_LABEL_STORAGE_KEY } from "@/lib/client/sourceDevice";

describe("DeviceLabelEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("saves a custom label and surfaces it as the active device tag", async () => {
    const user = userEvent.setup();
    render(<DeviceLabelEditor />);

    const input = await screen.findByLabelText("Device label");
    await user.type(input, "Studio Mac");
    await user.click(screen.getByRole("button", { name: "Save label" }));

    await waitFor(() =>
      expect(window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY)).toBe("Studio Mac")
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/Saved label/i);
    expect(screen.getByText(/(custom)/i)).toBeVisible();
  });

  it("clears a stored label when the user chooses 'Use detected'", async () => {
    window.localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, "Override");
    const user = userEvent.setup();
    render(<DeviceLabelEditor />);

    await waitFor(() => expect(screen.getByLabelText("Device label")).toHaveValue("Override"));

    await user.click(screen.getByRole("button", { name: "Use detected" }));

    await waitFor(() => expect(window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY)).toBeNull());
    expect(screen.getByLabelText("Device label")).toHaveValue("");
    expect(await screen.findByRole("status")).toHaveTextContent(/Reset to detected label/i);
  });
});
