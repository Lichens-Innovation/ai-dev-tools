import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { APP_VERSION_INFO } from "./constants.js";

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

    return {
      content: [
        {
          type: "text",
          text: msg,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  console.info("code-crawler MCP server is running...");
  await server.connect(transport);
}

main();
