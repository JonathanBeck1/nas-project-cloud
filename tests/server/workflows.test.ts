import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflowsDir = path.join(process.cwd(), ".github", "workflows");
const workflows = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"));
const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ".github", ...segments), "utf8");
const readRepo = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

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

describe("release channels", () => {
  const publish = read("workflows", "docker-publish.yml");
  const { version } = JSON.parse(readRepo("package.json")) as { version: string };

  it("moves latest only on release tags and publishes main as edge", () => {
    const tags = publish.slice(publish.indexOf("tags: |"), publish.indexOf("- name: Build and publish image"));

    expect(tags).not.toMatch(/latest/);
    expect(tags).toContain("type=edge,branch=main");
    expect(tags).toContain("type=semver,pattern={{version}}");
    // Equal-priority entries keep their order, and the first becomes the image's version label.
    expect(tags.indexOf("pattern={{version}}")).toBeLessThan(tags.indexOf("pattern=v{{version}}"));
    // type=ref,event=tag would set latest for any v* tag that isn't valid semver, such as v0.5.
    expect(tags).not.toContain("type=ref");
    // latest comes from the default flavor (latest=auto) via the semver tags, which skip prereleases.
    expect(publish).not.toMatch(/^\s+flavor:/m);
  });

  it("never runs two publishes for the same ref at once", () => {
    expect(publish).toMatch(/^concurrency:\n  group: publish-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m);
  });

  it("pins the compose file and install docs to the current release", () => {
    const image = `ghcr.io/jonathanbeck1/nas-project-cloud:${version}`.replace(/\./g, "\\.");
    const docs = ["README.md", "docs/deployment/truenas-scale.md", "docker/docker-compose.truenas.yml"].map(readRepo).join("\n");
    const pins = [...docs.matchAll(/nas-project-cloud:(\d+\.\d+\.\d+)|^Tag: (\S+)$/gm)].map((match) => match[1] ?? match[2]);

    expect(readRepo("docker/docker-compose.truenas.yml")).toMatch(new RegExp(`^\\s+image: ${image}$`, "m"));
    expect(pins.length).toBeGreaterThan(2);
    expect(new Set(pins)).toEqual(new Set([version]));
  });

  it("lists the current release line as supported in SECURITY.md", () => {
    const [major, minor] = version.split(".");

    expect(readRepo("SECURITY.md")).toContain(`| Latest release line (currently ${major}.${minor}.x) | Yes |`);
  });
});
