import { getErrorMessage, isNullish } from "@lichens-innovation/ts-common";
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { buildMcpErrorResponse } from "../../mcp/mcp-server.utils";
import { readDirEntriesOrNull, readFileBufferOrNull, statFileOrNull } from "../../utils/fs/async-fs.utils";
import { getCodeCrawlerMaxIndexFileBytes } from "../../utils/env.utils";
import {
  inferSourceLanguageFromPath,
  TREE_SITTER_INDEXABLE_EXTENSION_SET,
} from "../chunking/chunk-language-file-extensions";
import type { FileIndexRecord } from "../types/index-domain.types";

const INDEX_SKIP_DIR_NAMES = new Set([
  ".git",
  ".github",
  ".vscode",
  ".idea",
  ".next",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  ".amplify",

  // mobile app platforms
  "ios",
  "android",
  ".expo",
]);

type LoadedIndexableFileContent = { document: string; stat: Stats };

const loadIndexableFileContent = async (fullPath: string): Promise<LoadedIndexableFileContent | null> => {
  console.info(`[loadIndexableFileContent] reading: ${fullPath}`);

  const st = await statFileOrNull(fullPath);
  if (!st || !st.isFile() || st.size > getCodeCrawlerMaxIndexFileBytes()) {
    return null;
  }

  const buf = await readFileBufferOrNull(fullPath);
  if (!buf) {
    return null;
  }

  const document = buf.toString("utf8");
  if (document.includes("\uFFFD")) {
    return null;
  }

  return { document, stat: st };
};

const pathHasIndexableExtension = (fullPath: string): boolean =>
  TREE_SITTER_INDEXABLE_EXTENSION_SET.has(extname(fullPath).toLowerCase());

interface TryBuildFileIndexRecordArgs {
  fullPath: string;
  repoRoot: string;
  repository: string;
}

const tryBuildFileIndexRecord = async ({
  fullPath,
  repoRoot,
  repository,
}: TryBuildFileIndexRecordArgs): Promise<FileIndexRecord | null> => {
  if (!pathHasIndexableExtension(fullPath)) {
    return null;
  }

  const loaded = await loadIndexableFileContent(fullPath);
  if (!loaded) {
    return null;
  }

  const { document, stat: st } = loaded;
  const relRaw = relative(repoRoot, fullPath);
  const path = relRaw.split(/[/\\]/).join("/");
  const sourceLanguage = inferSourceLanguageFromPath(path);
  if (isNullish(sourceLanguage)) {
    return null;
  }

  const id = `${repository}::${path}`;
  const lastModifiedAtISO = st.mtime.toISOString();
  const contentSha256 = createHash("sha256").update(document, "utf8").digest("hex");

  return {
    document,
    id,
    metadata: {
      contentSha256,
      fileId: id,
      filename: basename(fullPath),
      fullPath,
      lastModifiedAtISO,
      pathRelative: path,
      repository,
      sizeBytes: st.size,
      sourceLanguage,
    },
  };
};

interface WalkRepositoryForFileRecordsArgs {
  dir: string;
  records: FileIndexRecord[];
  repoRoot: string;
  repository: string;
}

const walkRepositoryForFileRecords = async ({
  dir,
  records,
  repoRoot,
  repository,
}: WalkRepositoryForFileRecordsArgs): Promise<void> => {
  const entries = await readDirEntriesOrNull(dir);
  if (!entries) {
    return;
  }

  for (const ent of entries) {
    const fullPath = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (INDEX_SKIP_DIR_NAMES.has(ent.name)) {
        continue;
      }

      await walkRepositoryForFileRecords({ dir: fullPath, records, repoRoot, repository });
      continue;
    }

    if (!ent.isFile()) {
      continue;
    }

    const rec = await tryBuildFileIndexRecord({ fullPath, repoRoot, repository });
    if (rec) {
      records.push(rec);
    }
  }
};

interface CollectFileRecordsArgs {
  repoRoot: string;
  repository: string;
}

const collectFileRecords = async ({ repoRoot, repository }: CollectFileRecordsArgs): Promise<FileIndexRecord[]> => {
  const records: FileIndexRecord[] = [];
  await walkRepositoryForFileRecords({ dir: repoRoot, records, repoRoot, repository });
  console.info(`[collectFileRecords][${repository}] discovery complete: ${records.length} indexable file(s)`);
  return records;
};

export interface CollectFileRecordsOk {
  ok: true;
  records: FileIndexRecord[];
}

export interface CollectFileRecordsFail {
  ok: false;
  result: CallToolResult;
}

export type CollectFileRecordsOutcome = CollectFileRecordsOk | CollectFileRecordsFail;

export interface TryCollectFileRecordsArgs {
  repoRoot: string;
  repository: string;
}

export const tryCollectFileRecords = async ({
  repoRoot,
  repository,
}: TryCollectFileRecordsArgs): Promise<CollectFileRecordsOutcome> => {
  try {
    const records = await collectFileRecords({ repoRoot, repository });
    return { ok: true, records };
  } catch (e: unknown) {
    const errorMessage = getErrorMessage(e);
    console.error(`[tryCollectFileRecords]: walk/read failed: ${errorMessage}`, e);
    return {
      ok: false,
      result: buildMcpErrorResponse(`Failed to scan repository files: ${errorMessage}`),
    };
  }
};
