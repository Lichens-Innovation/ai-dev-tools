import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import { getLocalMarketplaces, getMarketplacePluginsFromPath } from "@repo/claude-fs";

export interface MarketplaceData {
  marketplaces: string[];
  byMarketplace: Record<string, string[]>;
  cwd: string;
}

export interface MarketplaceList {
  marketplaces: string[];
}

export interface MarketplaceDefaults {
  cwd: string;
}

function readMarketplaceFile(): unknown {
  return JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8"));
}

export const getMarketplaceData = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceData> => {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      return readMarketplaceFile() as MarketplaceData;
    } catch {
      // file missing or is a directory — fall through to local reading
    }
  }
  const localMarketplaces = await getLocalMarketplaces();
  const byMarketplace: Record<string, string[]> = {};
  for (const [name, marketplace] of Object.entries(localMarketplaces)) {
    byMarketplace[name] = await getMarketplacePluginsFromPath(marketplace.installLocation);
  }
  return { marketplaces: Object.keys(localMarketplaces), byMarketplace, cwd: process.cwd() };
});

export const getMarketplaceList = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceList> => {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = readMarketplaceFile() as MarketplaceData;
      return { marketplaces: data.marketplaces };
    } catch {
      // fall through to local reading
    }
  }
  const localMarketplaces = await getLocalMarketplaces();
  return { marketplaces: Object.keys(localMarketplaces) };
});

export const getMarketplaceDefaults = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceDefaults> => {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = readMarketplaceFile() as { cwd?: string };
      return { cwd: data.cwd ?? "" };
    } catch {
      // fall through
    }
  }
  return { cwd: "" };
});
