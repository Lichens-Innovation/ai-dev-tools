import { Module } from "@nestjs/common";
import { McpController } from "./mcp.controller";
import { McpStreamableHttpService } from "./mcp-streamable-http.service";

@Module({
  controllers: [McpController],
  providers: [McpStreamableHttpService],
})
export class McpModule {}
