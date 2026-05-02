import { describe, expect, it } from "vitest";
import { requireApiSession } from "@/lib/server/auth/guards";

describe("auth guards", () => {
  it("rejects requests without a session cookie", async () => {
    const result = await requireApiSession(new Request("http://localhost/api/files"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: "authentication required" });
    }
  });
});
