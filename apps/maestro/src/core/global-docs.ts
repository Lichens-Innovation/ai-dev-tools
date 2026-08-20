// The global Docs page's node side: the app's own end-user docs plus the Claude Code concept
// docs, read from directories the app SHIPS rather than from anything under a project root.
//
// Why this is a thin aggregator over `docs.ts` rather than a fork of it: `listDocsIn`/
// `docSectionsIn` are the one heading-slugging, one markdown-parsing implementation the per-project
// reader already uses, and a second copy here would be a second slugifier to keep in sync with
// search. This module's whole job is picking the two directories and tagging what comes back.

import type { DocContent, DocMeta, DocSection, GlobalDocsData } from "./contracts.js";
import { docSectionsIn, listDocsIn, readDocIn } from "./docs.js";

export type { GlobalDocsData };

/** Which of the two global corpora a doc or section belongs to. */
export type DocGroup = "app" | "claude-code";

/** Resolves the directory a group reads from, or null when that build doesn't ship it. */
export interface GlobalDocsDirs {
  app: string | null;
  claudeCode: string | null;
}

function dirFor(group: DocGroup, dirs: GlobalDocsDirs): string | null {
  return group === "app" ? dirs.app : dirs.claudeCode;
}

/**
 * The global Docs page's landing data: both corpora's doc lists, plus a combined, group-tagged
 * search index.
 *
 * Never throws. A corpus whose directory hasn't resolved (see `maestroAppDocsDir`/
 * `claudeCodeDocsDir` in `src/main/bundled-assets.ts`) contributes an empty list rather than
 * failing the whole page — a dev checkout missing one doc tree should not cost the other.
 */
export function globalDocsData(dirs: GlobalDocsDirs): GlobalDocsData {
  const app: DocMeta[] = (dirs.app ? listDocsIn(dirs.app) : []).map((d) => ({ ...d, group: "app" }));
  const claudeCode: DocMeta[] = (dirs.claudeCode ? listDocsIn(dirs.claudeCode) : []).map((d) => ({
    ...d,
    group: "claude-code",
  }));

  const sections: DocSection[] = [
    ...(dirs.app ? docSectionsIn(dirs.app) : []).map((s): DocSection => ({ ...s, group: "app" })),
    ...(dirs.claudeCode ? docSectionsIn(dirs.claudeCode) : []).map((s): DocSection => ({ ...s, group: "claude-code" })),
  ];

  return { app, claudeCode, sections };
}

/** One doc's body from either global corpus. Throws when the group's directory hasn't resolved. */
export function readGlobalDoc(group: DocGroup, slug: string, dirs: GlobalDocsDirs): DocContent {
  const dir = dirFor(group, dirs);
  if (!dir) {
    throw new Error(
      group === "app"
        ? "The Maestro app docs are not available in this build."
        : "The Claude Code concept docs are not available in this build."
    );
  }
  return readDocIn(dir, slug);
}
