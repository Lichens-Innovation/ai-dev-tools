/** Indexed source language id (tree-sitter / graph-chunk routing). */

export const SOURCE_LANGUAGE_IDS = ["typescript", "javascript", "python", "cpp", "csharp"] as const;

export type SourceLanguageId = (typeof SOURCE_LANGUAGE_IDS)[number];
