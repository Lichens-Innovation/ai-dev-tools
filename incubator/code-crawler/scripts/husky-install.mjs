import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let gitTop;
try {
  gitTop = execSync("git rev-parse --show-toplevel", {
    encoding: "utf8",
    cwd: pkgRoot,
  }).trim();
} catch {
  process.exit(0);
}

const huskyDir = path.join(pkgRoot, ".husky");
const relFromGit = path.relative(gitTop, huskyDir);
if (!relFromGit || relFromGit.startsWith("..")) {
  process.exit(0);
}

const huskyBin = path.join(pkgRoot, "node_modules", "husky", "bin.js");
if (!existsSync(huskyBin)) {
  process.exit(0);
}

execFileSync(process.execPath, [huskyBin, relFromGit], {
  cwd: gitTop,
  stdio: "inherit",
});
