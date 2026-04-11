#!/usr/bin/env node
import { isBlank } from "@lichens-innovation/ts-common";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module";

interface ParsePortArgs {
  fallback: number;
  raw: string | undefined;
}

const DefValues = {
  port: 3333,
  host: "127.0.0.1",
} as const;

const parsePort = ({ raw, fallback }: ParsePortArgs): number => {
  if (isBlank(raw)) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return fallback;
  }
  return parsed;
};

const main = async (): Promise<void> => {
  const logger = new Logger("[code-crawler main]");

  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.enableShutdownHooks();

  // Local SPA dev: reflect browser Origin. Tighten with CODE_CRAWLER_CORS_ORIGIN in production if needed.
  app.enableCors({
    origin: process.env.CODE_CRAWLER_CORS_ORIGIN?.trim() || true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
  });

  const host = process.env.CODE_CRAWLER_HOST ?? DefValues.host;
  const port = parsePort({ raw: process.env.CODE_CRAWLER_PORT, fallback: DefValues.port });

  await app.listen(port, host);
  logger.log(`Lichens Code Crawler MCP (Streamable HTTP) at http://${host}:${port}/mcp`);
  logger.log(`Lichens Code Crawler REST API at http://${host}:${port}/api`);
  logger.log(`Static UI (hub) at http://${host}:${port}/`);
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
