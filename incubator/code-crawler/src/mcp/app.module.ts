import { Module } from "@nestjs/common";
import { McpModule } from "./mcp.module";

@Module({
  imports: [McpModule],
})
export class AppModule {}
