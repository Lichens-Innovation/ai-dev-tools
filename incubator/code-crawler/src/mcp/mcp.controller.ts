import { Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { McpStreamableHttpService } from "./mcp-streamable-http.service";

@Controller()
export class McpController {
  constructor(private readonly mcpStreamableHttp: McpStreamableHttpService) {}

  /**
   * Handles MCP JSON-RPC over HTTP. Without an `mcp-session-id`, accepts only an `initialize`
   * request to create a session; with a valid session id, forwards the request body to the
   * existing streamable transport (e.g. tools/list, tools/call).
   */
  @Post("mcp")
  async postMcp(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    await this.mcpStreamableHttp.handlePost({ req, res });
  }

  /**
   * Opens the streamable side of an MCP session. Requires a valid `mcp-session-id` header;
   * used by the streamable HTTP transport for ongoing server-to-client delivery (e.g. SSE).
   */
  @Get("mcp")
  async getMcp(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    await this.mcpStreamableHttp.handleGet({ req, res });
  }

  /**
   * Terminates an MCP session. Requires a valid `mcp-session-id` header; closes the
   * streamable transport and releases server-side session state.
   */
  @Delete("mcp")
  async deleteMcp(@Req() req: Request, @Res({ passthrough: false }) res: Response): Promise<void> {
    await this.mcpStreamableHttp.handleDelete({ req, res });
  }
}
