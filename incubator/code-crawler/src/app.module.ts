import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ZodValidationPipe } from "nestjs-zod";
import { join } from "node:path";
import { ApiModule } from "./api/api.module";
import { McpModule } from "./mcp/mcp.module";

@Module({
  imports: [
    McpModule,
    ApiModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "public"),
    }),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
