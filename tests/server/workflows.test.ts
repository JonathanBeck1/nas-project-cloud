import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowsDir = path.join(process.cwd(), ".github", "workflows");
const workflows = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"));
const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ".github", ...segments), "utf8");

describe("CI supply chain", () => {
  it.each(workflows)("%s pins every action to a commit SHA with its version in a comment", (name) => {
    const uses = read("workflows", name)
      .split("\n")
      .filter((line) => /^\s*(- )?uses:/.test(line));

    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it.each(workflows)("%s does not leave the job token in .git/config", (name) => {
    const workflow = read("workflows", name);
    const checkouts = workflow.match(/uses: actions\/checkout@/g) ?? [];

    expect(checkouts.length).toBeGreaterThan(0);
    expect(workflow.match(/persist-credentials: false/g) ?? []).toHaveLength(checkouts.length);
  });

  it("keeps npm away from the job that can push images", () => {
    const publish = read("workflows", "docker-publish.yml");
    const topLevel = publish.slice(0, publish.indexOf("\njobs:"));
    const publishJob = publish.slice(publish.indexOf("\n  publish:"));
    const verifyJob = publish.slice(publish.indexOf("\n  verify:"), publish.indexOf("\n  publish:"));

    expect(topLevel).not.toContain("packages: write");
    expect(verifyJob).not.toContain("packages: write");
    expect(verifyJob).toContain("run: npm ci");
    expect(publishJob).toContain("needs: verify");
    expect(publishJob).toContain("packages: write");
    expect(publishJob).not.toMatch(/run: npm|setup-node/);
  });

  it("publishes the image with provenance and an SBOM", () => {
    const publish = read("workflows", "docker-publish.yml");

    expect(publish).toMatch(/^\s+provenance: true$/m);
    expect(publish).toMatch(/^\s+sbom: true$/m);
  });

  it("has Dependabot watching npm and the pinned actions", () => {
    const dependabot = read("dependabot.yml");

    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
    // Grouped and no majors, so a config change cannot bring back one PR per dependency.
    expect(dependabot.match(/^\s+groups:$/gm)).toHaveLength(2);
    expect(dependabot.match(/version-update:semver-major/g)).toHaveLength(2);
  });
});
