import fs from "node:fs";
import path from "node:path";

const e2eDataDir = path.resolve(".data/e2e");

fs.rmSync(e2eDataDir, { recursive: true, force: true });
fs.mkdirSync(e2eDataDir, { recursive: true });
