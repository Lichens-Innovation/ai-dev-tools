import { isBlank, isNotBlank } from "@lichens-innovation/ts-common";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { createCodeCrawlerMcpServer } from "./code-crawler-mcp-server.factory";
import { JsonRpcStandardCodes, McpRpcCodes } from "./mcp-rpc.constants";

interface McpHttpRequestArgs {
  req: Request;
  res: Response;
}

interface SendJsonRpcErrorArgs {
  code: number;
  httpStatus: number;
  message: string;
  res: Response;
}

@Injectable()
export class McpStreamableHttpService implements OnApplicationShutdown {
  private readonly logger = new Logger(McpStreamableHttpService.name);

  private readonly transports: Record<string, StreamableHTTPServerTransport> = {};

  async onApplicationShutdown(): Promise<void> {
    await this.closeAllTransports();
  }

  private async closeAllTransports(): Promise<void> {
    for (const sessionId of Object.keys(this.transports)) {
      try {
        await this.transports[sessionId]?.close();
        delete this.transports[sessionId];
      } catch (error) {
        this.logger.error(`Error closing transport ${sessionId}`, error);
      }
    }
  }

  private getMcpSessionId(req: Request): string | undefined {
    const header = req.headers["mcp-session-id"];
    return typeof header === "string" ? header : header?.[0];
  }

  private getExistingTransportOr400({ req, res }: McpHttpRequestArgs): StreamableHTTPServerTransport | undefined {
    const sessionId = this.getMcpSessionId(req);
    if (isBlank(sessionId) || !this.transports[sessionId]) {
      res.status(StatusCodes.BAD_REQUEST).send("Invalid or missing session ID");
      return undefined;
    }
    return this.transports[sessionId];
  }

  async handlePost({ req, res }: McpHttpRequestArgs): Promise<void> {
    const sessionId = this.getMcpSessionId(req);

    try {
      if (isNotBlank(sessionId) && this.transports[sessionId]) {
        await this.transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      if (isBlank(sessionId) && req.body && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            this.transports[sessionId] = transport;
            this.logger.log(`MCP session initialized: ${sessionId}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (isNotBlank(sid) && this.transports[sid]) {
            this.logger.log(`MCP transport closed: ${sid}`);
            delete this.transports[sid];
          }
        };

        const server = createCodeCrawlerMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      this.sendNoValidSessionIdError(res);
    } catch (error) {
      this.logger.error("Error handling MCP POST", error);
      if (!res.headersSent) {
        this.sendJsonRpcInternalServerError(res);
      }
    }
  }

  async handleGet({ req, res }: McpHttpRequestArgs): Promise<void> {
    const transport = this.getExistingTransportOr400({ req, res });
    if (!transport) {
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      this.logger.error("Error handling MCP GET", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Internal server error");
      }
    }
  }

  async handleDelete({ req, res }: McpHttpRequestArgs): Promise<void> {
    const transport = this.getExistingTransportOr400({ req, res });
    if (!transport) {
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      this.logger.error("Error handling MCP DELETE", error);
      if (!res.headersSent) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Error processing session termination");
      }
    }
  }

  private sendNoValidSessionIdError(res: Response): void {
    this.sendJsonRpcError({
      res,
      httpStatus: StatusCodes.BAD_REQUEST,
      code: McpRpcCodes.noValidSessionId,
      message: "Bad Request: No valid session ID provided",
    });
  }

  private sendJsonRpcInternalServerError(res: Response): void {
    this.sendJsonRpcError({
      res,
      httpStatus: StatusCodes.INTERNAL_SERVER_ERROR,
      code: JsonRpcStandardCodes.internalError,
      message: "Internal server error",
    });
  }

  private sendJsonRpcError({ res, httpStatus, code, message }: SendJsonRpcErrorArgs): void {
    res.status(httpStatus).json({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    });
  }
}
