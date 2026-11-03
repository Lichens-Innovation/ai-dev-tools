# Design studio core: project store, MCP endpoint, Docker, live page view

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

Work on branch feat/design-studio. Create a new app in this monorepo, the design studio: a local, single-user replacement for Claude Design in the design plugin's loop. Same stack and Docker pattern as the help-server app (TanStack Start, Tailwind v4, shared @repo/ui and @repo/styles, server functions, Vitest), workspace name design-studio, port 3009. One container per target project: compose mounts the project given by PROJECT_DIR at /project (read-write), the port comes from STUDIO_PORT (default 3009), and it is started with a per-project compose name.

The target project stores designs as plain files under design/: assets/project.css and assets/<hash>.<ext> (captured CSS, images, fonts), components/<kebab>.html and screens/<kebab>.html (reference snapshots, read only, written only by a capture script that comes later), proposals/<kebab>.html and proposals/screens/<kebab>.html (editable copies, the targets the design loop implements), and index.json (the catalog: kind, name, reference, proposal, storyId or route, states). Pages are full HTML documents that link ../assets/project.css (proposals/screens use ../../assets) and follow <html data-theme>.

The heart is one deep server module, DesignProject, shared by the UI server functions and the MCP tools. Interface (the decision of a design pass, keep it):
- openProject(root): DesignProject
- pages.list(): { kind: 'component'|'screen', name, hasProposal, referenceHash, proposalHash }[]
- pages.read({kind,name}, 'reference'|'proposal'): { html, hash }
- pages.createProposal({kind,name}): { hash }. Copies the reference; fails if a proposal exists.
- pages.saveProposal({kind,name}, html, baseHash): { hash }
- palette.read(): { inputs, tokens, overrides, namespace, audit, hash }
- palette.save(draft, baseHash): { audit, written: string[] }. Writes the manifest's palette inputs file and regenerates every manifest palette output in-process, by importing the project's copy of palette.ts (manifest palette.script) and calling the same exported functions its palette script uses.
- watch(listener): unsubscribe. Emits { kind: 'page'|'palette', name?, hash } on file changes (chokidar on design/ and the palette inputs).
Rules: pages are addressed by {kind,name}, never by path, so nothing escapes design/. References can never be written through it. A stale baseHash fails with Conflict; other errors are NotFound and Invalid (HTML loading something outside design/assets, bad palette values). Writes are atomic (tmp + rename). Filesystem and palette.ts are used directly (no ports); tests use a temp copy of a fixture project. Editor selection is not part of this module: a separate small in-memory selection holder that the browser pushes to and MCP reads.

MCP endpoint at /mcp (Streamable HTTP, @modelcontextprotocol/sdk), thin over DesignProject: list_pages, get_page, create_proposal, write_page (proposals only), get_selection (returns whatever the selection holder has, empty for now), get_palette, set_palette, open_page (tells the open browser to navigate, via the server-sent event stream). A server-sent event stream relays watch() events and open_page to the browser. A /render/* route serves the raw page files so Playwright can screenshot http://localhost:3009/render/proposals/button.html. A minimal page view route shows a page's reference or proposal in an iframe and reloads it when its file changes. A plain list of pages on the home route is enough; the real shell comes in a later task. Add CLAUDE.md and README.md for the app following help-server's, and register the app wherever the repo's lockfile check covers apps.

## Acceptance criteria

- [ ] pnpm --filter design-studio test, lint and build pass
- [ ] Vitest through openProject on a fixture project covers: list and read, createProposal and saveProposal, a stale baseHash failing with Conflict, reference writes refused, palette.save outputs identical to running palette.ts on the same inputs, and watch emitting after an external write
- [ ] PROJECT_DIR=<fixture or sample project> docker compose -p design-<name> up --build serves the app on the configured port with the project mounted
- [ ] After claude mcp add --transport http design-studio http://localhost:3009/mcp, calling create_proposal then write_page from Claude Code updates the page already open in the browser without a manual reload
- [ ] write_page on a reference and any path-like name are rejected
- [ ] /render serves a proposal that Playwright can screenshot with its CSS applied

## Blocked by

None — can start immediately
