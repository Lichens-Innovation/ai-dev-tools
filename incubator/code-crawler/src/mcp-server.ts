import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { APP_VERSION_INFO } from "./constants.js";
import { listGitRepoRootsUnderParent } from "./git-projects.utils.js";
import { buildMcpErrorResponse, buildMcpTextResponse } from "./mcp-server.utils.js";

const server = new McpServer({
  title: "Lichens Code Crawler",
  name: APP_VERSION_INFO.NAME,
  version: APP_VERSION_INFO.VERSION,
  description: APP_VERSION_INFO.DESCRIPTION,
  websiteUrl: APP_VERSION_INFO.REPOSITORY,
});

server.registerTool(
  "echo",
  {
    title: "Echo a message",
    description: "Echo a message",
    inputSchema: z.object({
      message: z.string().describe("The message to echo"),
    }),
  },
  async ({ message }) => {
    const msg = `You said: ${message}. Here the version of the server: ${APP_VERSION_INFO.VERSION}`;
    return buildMcpTextResponse(msg);
  }
);

server.registerTool(
  "list-local-git-projects",
  {
    title: "List local Git projects",
    description:
      "Recursively finds Git repository roots under a given parent directory (stops at each .git root; skips node_modules).",
    inputSchema: z.object({
      parentDirectory: z
        .string()
        .min(1)
        .describe("Absolute or relative path to the parent folder to scan (e.g. /Users/me/src or ~/Projects)"),
    }),
  },
  async ({ parentDirectory }) => {
    const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
    if (error) {
      return buildMcpErrorResponse(error);
    }

    return buildMcpTextResponse(repos.join("\n"));
  }
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  console.info("code-crawler MCP server is running...");
  await server.connect(transport);
};

void main();
