import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { APP_VERSION_INFO } from "./constants.js";
import { listLocalGitProjects, listLocalGitProjectsInputSchema } from "./git-projects.utils.js";

const server = new McpServer({
  title: "Lichens Code Crawler",
  name: APP_VERSION_INFO.NAME,
  version: APP_VERSION_INFO.VERSION,
  description: APP_VERSION_INFO.DESCRIPTION,
  websiteUrl: APP_VERSION_INFO.REPOSITORY,
});

server.registerTool(
  "list-local-git-projects",
  {
    title: "List local Git projects",
    description:
      "Recursively finds Git repository roots under a given parent directory (stops at each .git root; skips node_modules).",
    inputSchema: listLocalGitProjectsInputSchema,
  },
  listLocalGitProjects
);

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  console.info("code-crawler MCP server is running...");
  await server.connect(transport);
};

void main();
