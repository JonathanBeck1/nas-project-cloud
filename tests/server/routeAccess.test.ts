import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every API handler must be classified here, so a new route can't ship checking only that someone is signed in.
//   public   no session: sign-in steps, accepting an invite, pairing, share-link downloads, the health probe
//   self     acts only on the caller's own records (2FA, devices, upload sessions)
//   any      any signed-in user, on data shared by the whole library (category and tag names)
//   list     a listing filtered to what the caller can see
//   file     checks the caller's access to each file it touches
//   project  checks the caller's access to the project
//   admin    owner and admins only (or the maintenance token)
//   token    the maintenance token only
type Policy = "public" | "self" | "any" | "list" | "file" | "project" | "admin" | "token";

const POLICIES: Record<string, Policy> = {
  "auth/login POST": "public",
  "auth/login/verify POST": "public",
  "auth/logout POST": "public",
  "auth/setup POST": "public",
  "auth/two-factor GET": "self",
  "auth/two-factor/enable POST": "self",
  "auth/two-factor/recovery-codes POST": "self",
  "auth/two-factor/setup POST": "self",
  "categories GET": "any",
  "categories POST": "admin",
  "categories/[id] PATCH": "admin",
  "categories/[id] DELETE": "admin",
  "devices GET": "self",
  "devices POST": "self",
  "devices/[id] DELETE": "self",
  "devices/pair POST": "public",
  "files GET": "list",
  "files POST": "project",
  "files/[id] GET": "file",
  "files/[id] PATCH": "file",
  "files/[id]/archive POST": "file",
  "files/[id]/delete DELETE": "file",
  "files/[id]/download GET": "file",
  "files/[id]/preview GET": "file",
  "files/[id]/restore POST": "file",
  "files/[id]/shares GET": "file",
  "files/[id]/shares POST": "file",
  "files/[id]/shares/[shareId] DELETE": "file",
  "files/[id]/shares/[shareId] PATCH": "file",
  "files/[id]/shares/[shareId]/events GET": "file",
  "files/bulk POST": "file",
  "files/bulk/download GET": "file",
  "health GET": "public",
  "invites GET": "admin",
  "invites POST": "admin",
  "invites/[id] DELETE": "admin",
  "invites/accept POST": "public",
  "maintenance/previews POST": "admin",
  "maintenance/previews/status GET": "admin",
  "maintenance/reindex GET": "admin",
  "maintenance/reindex POST": "admin",
  "maintenance/two-factor-reset POST": "token",
  "maintenance/upload-cleanup POST": "admin",
  "projects GET": "list",
  "projects POST": "admin",
  "projects/[id] PATCH": "admin",
  "projects/[id] DELETE": "admin",
  "projects/[id]/download GET": "project",
  "projects/[id]/members GET": "admin",
  "projects/[id]/members/[userId] PATCH": "admin",
  "projects/[id]/members/[userId] DELETE": "admin",
  "search GET": "list",
  "shares/[token]/download GET": "public",
  "shares/[token]/download HEAD": "public",
  "shares/[token]/download POST": "public",
  "smart-views/[view] GET": "list",
  "tags GET": "any",
  "tags POST": "any",
  "tags/[id] DELETE": "admin",
  "upload-sessions GET": "self",
  "upload-sessions POST": "project",
  "upload-sessions/open GET": "self",
  "upload-sessions/[id]/abort POST": "self",
  "upload-sessions/[id]/chunk POST": "self",
  "upload-sessions/[id]/complete POST": "self",
  "users GET": "admin",
  "users/[id] PATCH": "admin",
  "users/[id] DELETE": "admin",
  "users/[id]/two-factor-reset POST": "admin"
};

// What the route file has to contain for its policy to hold.
const MARKERS: Record<Policy, RegExp[]> = {
  public: [],
  self: [/requireApiSession\(/, /(auth|session|actor)\.userId/],
  any: [/requireApiSession\(/],
  list: [/requireApiSession\(/, /visibleTo\(/],
  file: [/requireApiSession\(/, /fileDenied\(|fileAccess\(/],
  project: [/requireApiSession\(/, /projectDenied\(/],
  admin: [/adminOnly\(|requireMaintenanceAuth\(/],
  token: [/requireMaintenanceToken\(/]
};

const apiRoot = path.join(process.cwd(), "src/app/api");

function routeHandlers(): Map<string, string> {
  const handlers = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "route.ts") {
        const source = fs.readFileSync(full, "utf8");
        const route = path.relative(apiRoot, dir).split(path.sep).join("/");
        for (const [, method] of source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE|HEAD)\(/g)) {
          handlers.set(`${route} ${method}`, source);
        }
      }
    }
  };
  walk(apiRoot);
  return handlers;
}

describe("API route access policies", () => {
  const handlers = routeHandlers();

  it("classifies every handler, and lists none that no longer exist", () => {
    expect([...handlers.keys()].sort()).toEqual(Object.keys(POLICIES).sort());
  });

  it.each(Object.entries(POLICIES))("%s enforces its %s policy", (key, policy) => {
    const source = handlers.get(key) ?? "";
    for (const marker of MARKERS[policy]) {
      expect(source, `${key} should match ${marker}`).toMatch(marker);
    }
  });
});
