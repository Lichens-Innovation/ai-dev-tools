// Client-side data access for the /tools dashboard.
//
// One call, four tabs. This is what help-server's six `createServerFn` handlers became: the node
// side reads the machine once and hands back a payload the whole view renders from.

import type { ToolsData } from "../../../shared/ipc";

export type {
  ToolsData,
  InstalledPluginInfo,
  MarketplacePluginInfo,
  DefinitionSummary,
  CuratedPlugin,
  RuleLibraryEntry,
  ClaudeCommand,
} from "../../../shared/ipc";

export function getToolsData(): Promise<ToolsData> {
  return window.maestro.data.tools();
}
