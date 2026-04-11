#!/usr/bin/env node
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { getCodeCrawlerCorsOrigin, getCodeCrawlerHost, getCodeCrawlerPort } from "./utils/env.utils";

const main = async (): Promise<void> => {
  const logger = new Logger("[code-crawler main]");

  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.enableShutdownHooks();

  // Local SPA dev: reflect browser Origin. Tighten with CODE_CRAWLER_CORS_ORIGIN in production if needed.
  app.enableCors({
    origin: getCodeCrawlerCorsOrigin(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
  });

  const host = getCodeCrawlerHost();
  const port = getCodeCrawlerPort();

  await app.listen(port, host);
  logger.log(`Lichens Code Crawler MCP (Streamable HTTP) at http://${host}:${port}/mcp`);
  logger.log(`Lichens Code Crawler REST API at http://${host}:${port}/api`);
  logger.log(`Static UI (hub) at http://${host}:${port}/`);
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
