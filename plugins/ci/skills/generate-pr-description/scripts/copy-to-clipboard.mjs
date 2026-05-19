#!/usr/bin/env node
/**
 * Copy file content to the system clipboard (platform-agnostic).
 * Usage: node copy-to-clipboard.mjs <full-path-to-file>
 */
import { spawn } from "child_process";
import { readFileSync } from "fs";

const runClipboardCommand = (command, args, content) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => reject(new Error(`command not found: ${command}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.stdin.write(content, "utf-8", (err) => {
      if (err) {
        reject(err);
        return;
      }
      child.stdin.end((endErr) => {
        if (endErr) reject(endErr);
      });
    });
  });
};

const copyToClipboard = async (content) => {
  const platform = process.platform;
  if (platform === "darwin") return runClipboardCommand("pbcopy", [], content);
  if (platform === "win32") return runClipboardCommand("clip", [], content);
  try {
    return await runClipboardCommand("xclip", ["-selection", "clipboard"], content);
  } catch {
    return runClipboardCommand("xsel", ["--clipboard", "--input"], content);
  }
};

const main = async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node copy-to-clipboard.mjs <full-path-to-file>");
    process.exit(1);
  }

  try {
    const text = readFileSync(filePath, "utf-8");
    await copyToClipboard(text);
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`File not found: ${filePath}`);
      console.error("Create pr-description.md at the PR project root first, then run this script.");
    } else {
      console.error("Failed to copy to clipboard:", e.message);
    }
    process.exit(1);
  }
};

main();
