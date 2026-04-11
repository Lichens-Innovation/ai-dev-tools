import { downloadFile, ListFileEntry, listFiles } from "@huggingface/hub";
import { getErrorMessage } from "@lichens-innovation/ts-common";
import { createWriteStream, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const APP_HOME_SUBDIR = "code-crawler";
const MODELS_SUBDIR = "models";

const MODELS_ROOT = join(homedir(), APP_HOME_SUBDIR, MODELS_SUBDIR);

interface StreamBlobToFileArgs {
  blob: Blob;
  destPath: string;
}

const streamBlobToFile = async ({ blob, destPath }: StreamBlobToFileArgs): Promise<void> => {
  mkdirSync(dirname(destPath), { recursive: true });
  const webStream = blob.stream();
  await pipeline(Readable.fromWeb(webStream), createWriteStream(destPath));
};

const listAllRepoFileEntries = async (repoId: string): Promise<ListFileEntry[]> => {
  const entries: ListFileEntry[] = [];

  const listIterator = listFiles({ repo: repoId, recursive: true });
  while (true) {
    const step = await listIterator.next();
    if (step.done) break;
    entries.push(step.value);
  }

  return entries;
};

const downloadModel = async (repoId: string): Promise<void> => {
  const destRoot = join(MODELS_ROOT, repoId);
  mkdirSync(destRoot, { recursive: true });

  const entries = await listAllRepoFileEntries(repoId);
  const filePaths = entries.filter((e) => e.type === "file").map((e) => e.path);

  console.info(`[models-download][${repoId}] Downloading ${filePaths.length} file(s) to ${destRoot}`);
  for (const relativePath of filePaths) {
    const blob = await downloadFile({ repo: repoId, path: relativePath });
    if (!blob) {
      throw new Error(`File not found on the Hub: ${repoId} @ ${relativePath}`);
    }

    const localPath = join(destRoot, relativePath);
    await streamBlobToFile({ blob, destPath: localPath });
    console.info(`  ✓ ${relativePath}`);
  }

  console.info(`[models-download][${repoId}] Done.`);
};

const main = async (): Promise<void> => {
  const modelIds = process.argv.slice(2).filter(Boolean);

  if (modelIds.length === 0) {
    console.error("Usage: tsx ./scripts/models-download.ts <org/repo> [<org/repo> ...]");
    process.exit(1);
  }

  try {
    mkdirSync(MODELS_ROOT, { recursive: true });

    for (const repoId of modelIds) {
      await downloadModel(repoId);
    }
  } catch (err) {
    const message = getErrorMessage(err);
    console.error(`[models-download] Error: ${message}`, err);
    process.exit(1);
  }
};

void main();
