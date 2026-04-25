import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types";
import { getRepositoriesInfos } from "../utils/git-repositories.utils";
import { toString } from "../utils/arrays.utils";
import { buildMcpResourceResponse, generateMcpResourceError } from "./mcp-server.utils";
import {
  semanticSearchWorkspaceFiles,
  semanticSearchWorkspaceFilesInputSchema,
} from "../semantic-service/semantic-workspace.tools";
import { EnvNames } from "../utils/env.utils";
import { APP_VERSION_INFO } from "../version.gen";

/** Hints for MCP clients (Cursor, Claude Code, etc.): confirmation UI and tool grouping. Untrusted per spec. */
const semanticSearchAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const registerCodeCrawlerTools = (mcpServer: McpServer): void => {
  mcpServer.registerTool(
    "semantic-search-workspace-files",
    {
      title: "Search indexed code (natural language)",
      description: toString([
        "Call this tool when the user wants to search internal / indexed code by meaning—not only the repo open in the editor.",
        "Trigger intents include:",
        "search across or through the Lichens codebase;",
        "search in the company codebase;",
        "search the organization's private code.",
        "Similarity search over already-embedded chunks (not whole files). The index must exist on this server (built outside this MCP surface).",
        "`queryText` is a normal question or phrase in the user's language; optional `repository` filters to the same key used at index time (basename for single-repo index, or relative path for multi-repo); omit to search everything.",
        "See resource `code-crawler://workspace-repositories` for repo keys under the configured root.",
        "`nbResults` defaults to 10 (max 50).",
        "Each hit is a chunk with file path, line range, and preview—open files in the editor for full context.",
      ]),
      inputSchema: semanticSearchWorkspaceFilesInputSchema,
      annotations: semanticSearchAnnotations,
    },
    semanticSearchWorkspaceFiles
  );
};

const registerCodeCrawlerResources = (mcpServer: McpServer): void => {
  mcpServer.registerResource(
    "workspace-repositories",
    "code-crawler://workspace-repositories",
    {
      title: "Discover Git repos",
      description: `JSON list of Git repository roots under ${EnvNames.root} (or configured parent). Use the names/paths as \`repository\` filters in \`semantic-search-workspace-files\` (same keys as at index time).`,
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
        "Semantic code search MCP: search runs on the machine hosting this server against an existing local index.",
        "Use semantic-search-workspace-files when the user asks to search by meaning across internal indexed code—not only the workspace file tree in front of them.",
        "Treat these as strong signals to call the tool:",
        "- across / through the Lichens codebase;",
        "- in the company or enterprise codebase;",
        "- the organization's private code.",
        "Optional: read code-crawler://workspace-repositories first to pick repository keys for filters.",
        `Environment: ${EnvNames.root} is the default parent of Git repos.`,
      ].join("\n"),
    }
  );

  registerCodeCrawlerTools(mcpServer);
  registerCodeCrawlerResources(mcpServer);

  return mcpServer;
};
