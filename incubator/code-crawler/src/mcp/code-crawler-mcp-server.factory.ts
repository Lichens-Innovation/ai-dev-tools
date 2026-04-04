import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types";
import { getRepositoriesInfos } from "../semantic-service/git-projects.utils";
import { toString } from "../utils/arrays.utils";
import { buildMcpResourceResponse, generateMcpResourceError } from "./mcp-server.utils";
import {
  clearWorkspaceSemanticSearchIndex,
  clearWorkspaceSemanticSearchIndexInputSchema,
  prepareRepositoryForSemanticSearch,
  prepareRepositoryForSemanticSearchInputSchema,
  prepareWorkspaceRepositoriesForSemanticSearch,
  prepareWorkspaceRepositoriesForSemanticSearchInputSchema,
  semanticSearchWorkspaceFiles,
  semanticSearchWorkspaceFilesInputSchema,
} from "../semantic-service/repo-embeddings.utils";
import { APP_VERSION_INFO } from "../version.gen";

/** Hints for MCP clients (Cursor, Claude Code, etc.): confirmation UI and tool grouping. Untrusted per spec. */
const indexOneRepoAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const indexAllReposAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const semanticSearchAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const clearIndexAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const registerCodeCrawlerTools = (mcpServer: McpServer): void => {
  mcpServer.registerTool(
    "prepare-repository-for-semantic-search",
    {
      title: "Index one Git repo (semantic)",
      description: toString([
        "Use first when you need codebase-wide natural-language search over this MCP host:",
        "embeds one repository’s source into the local semantic index so `semantic-search-workspace-files` can find relevant line ranges.",
        "Pass `repository` as the folder basename under the parent (see resource `code-crawler://workspace-repositories` or env CODE_CRAWLER_ROOT); optional `rootDir` overrides that parent.",
        "Indexes text-like files only (.ts, .tsx, .js, .py, .c, .cpp, .cs), skips build/vendor dirs, max ~3 MiB per file unless CODE_CRAWLER_MAX_INDEX_FILE_BYTES is set.",
        "Chunk = overlapping line windows with path prefix.",
        "Response includes indexedFileCount, indexedChunkCount, and a small example search.",
      ]),
      inputSchema: prepareRepositoryForSemanticSearchInputSchema,
      annotations: indexOneRepoAnnotations,
    },
    prepareRepositoryForSemanticSearch
  );

  mcpServer.registerTool(
    "prepare-workspace-repositories-for-semantic-search",
    {
      title: "Index all Git repos under a root (semantic)",
      description: toString([
        "Batch version of `prepare-repository-for-semantic-search`:",
        "finds every Git root under optional `rootDir` (default CODE_CRAWLER_ROOT) and indexes each with the same rules.",
        "Prefer this when the user’s question spans multiple sibling repositories.",
        "Repository keys in the index are POSIX paths relative to `rootDir` (nested repos stay distinct).",
        "Returns per-repo counts, totals, and one workspace-wide example query.",
      ]),
      inputSchema: prepareWorkspaceRepositoriesForSemanticSearchInputSchema,
      annotations: indexAllReposAnnotations,
    },
    prepareWorkspaceRepositoriesForSemanticSearch
  );

  mcpServer.registerTool(
    "semantic-search-workspace-files",
    {
      title: "Search indexed code (natural language)",
      description: toString([
        "Use after indexing:",
        "answers “where is X implemented?” by similarity search over already-embedded chunks (not whole files).",
        "`queryText` is a normal question or phrase; optional `repository` filters to the same key used at index time (basename for single-repo index, or relative path for multi-repo); omit to search everything.",
        "`nbResults` defaults to 10 (max 50).",
        "Each hit is a chunk with file path, line range, and preview—open files in the editor for full context.",
      ]),
      inputSchema: semanticSearchWorkspaceFilesInputSchema,
      annotations: semanticSearchAnnotations,
    },
    semanticSearchWorkspaceFiles
  );

  mcpServer.registerTool(
    "clear-workspace-semantic-index",
    {
      title: "Wipe semantic index on this server",
      description: toString([
        "Deletes all vectors/chunks in this process’s persistent semantic store.",
        "Use only when you need a full rebuild (e.g. after large refactors or wrong root); then re-run prepare-* indexing tools.",
        "Irreversible for search data until re-indexed.",
      ]),
      inputSchema: clearWorkspaceSemanticSearchIndexInputSchema,
      annotations: clearIndexAnnotations,
    },
    clearWorkspaceSemanticSearchIndex
  );
};

const registerCodeCrawlerResources = (mcpServer: McpServer): void => {
  mcpServer.registerResource(
    "workspace-repositories",
    "code-crawler://workspace-repositories",
    {
      title: "Discover Git repos (for indexing)",
      description:
        "JSON list of Git repository roots under CODE_CRAWLER_ROOT (or configured parent). Use the names/paths to pick `repository` when calling `prepare-repository-for-semantic-search` or to interpret `repository` filters in `semantic-search-workspace-files`.",
      mimeType: "application/json",
    },
    async (uri): Promise<ReadResourceResult> => {
      const result = await getRepositoriesInfos();
      if ("error" in result) {
        return generateMcpResourceError({ uri: uri.href, errorText: result.error });
      }

      return buildMcpResourceResponse({ uri: uri.href, payload: result.payload });
    }
  );
};

/** New MCP server instance per Streamable HTTP session (required by the transport model). */
export const createCodeCrawlerMcpServer = (): McpServer => {
  const mcpServer = new McpServer(
    {
      title: "Lichens Code Crawler",
      name: APP_VERSION_INFO.NAME,
      version: APP_VERSION_INFO.VERSION,
      description: APP_VERSION_INFO.DESCRIPTION,
      websiteUrl: APP_VERSION_INFO.REPOSITORY,
    },
    {
      instructions: [
        "Semantic code search MCP: embeddings and search run on the machine hosting this server.",
        "Typical flow:",
        "(1) Optional: read resource code-crawler://workspace-repositories to list repos.",
        "(2) prepare-repository-for-semantic-search OR prepare-workspace-repositories-for-semantic-search to build/update the index.",
        "(3) semantic-search-workspace-files with a natural-language query.",
        "(4) clear-workspace-semantic-index only if a full reset is required, then re-index.",
        "Environment: CODE_CRAWLER_ROOT is the default parent of Git repos; CODE_CRAWLER_MAX_INDEX_FILE_BYTES caps per-file size.",
      ].join("\n"),
    }
  );

  registerCodeCrawlerTools(mcpServer);
  registerCodeCrawlerResources(mcpServer);

  return mcpServer;
};
