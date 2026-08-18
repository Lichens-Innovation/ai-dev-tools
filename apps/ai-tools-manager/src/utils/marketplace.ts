import { createServerFn } from "@tanstack/react-start";
import { getLocalMarketplaces, getMarketplacePluginsFromPath } from "@repo/claude-fs";

// Marketplace data, read from ~/.claude at request time.
//
// These used to read `/tmp/marketplace-data.json` first — the file a shell hook computed on the
// HOST and bind-mounted in, because a local marketplace's `installLocation` is a host path. That
// branch is gone, and with it the LAST READ of the precompute file anywhere in the repo, which is
// what lets `ensure-ai-tools-app.sh` stop writing it when the Docker path is retired.
//
// It still works inside the container: compose mounts `~/.claude` read-only at `/root/.claude`, so
// `getLocalMarketplaces` finds the same registry the hook was re-serialising. What the container
// cannot do is WRITE to those host paths — and it no longer has to, because the desktop app's
// create-* routes (`apps/maestro`) took that job over and run on the host.
//
// `cwd` is now always "": it came off the precompute file, and the only consumers of it were the
// create-* routes that have moved.

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

export const getMarketplaceData = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceData> => {
  const localMarketplaces = await getLocalMarketplaces();
  const byMarketplace: Record<string, string[]> = {};
  for (const [name, marketplace] of Object.entries(localMarketplaces)) {
    byMarketplace[name] = await getMarketplacePluginsFromPath(marketplace.installLocation);
  }
  return { marketplaces: Object.keys(localMarketplaces), byMarketplace, cwd: "" };
});

export const getMarketplaceList = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceList> => {
  return { marketplaces: Object.keys(await getLocalMarketplaces()) };
});

export const getMarketplaceDefaults = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceDefaults> => {
  return { cwd: "" };
});
