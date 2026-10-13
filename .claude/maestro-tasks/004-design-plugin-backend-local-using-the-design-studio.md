# Design plugin: backend: local using the design studio

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

Work on branch feat/design-studio. Teach the design plugin a second backend so a project can run the design loop against the local design studio instead of Claude Design. design.manifest.json gains "backend": "claude-design" | "local" (missing means claude-design, so existing projects behave exactly as today). For local, the manifest rows keep their meaning with local paths: designPath -> design/components/<n>.html, proposalPath -> design/proposals/<n>.html (screens: design/proposals/screens/<n>.html), mockupPath -> design/screens/<n>.html; designProjectId is unused; status and lastImplementedHash work unchanged (hash of the local proposal file).

Seam (the decision of a design pass, keep it): the skills call named backend operations, List targets, Fetch target, Stage render, Check references, Refresh references, and each backend implements them in its own reference doc (one for claude-design, describing today's DesignSync and ds-bundle steps; one for local). The seam lives in the docs, not a script, because the Claude Design adapter uses DesignSync, which only the model can call. Operations return what today's steps already use: target bytes at /tmp/design-loop/<name>.target.html, a hash, and a URL or file to screenshot. No inline backend branches scattered through the skills beyond calling the operation.

Local adapter tooling: a local-backend script (list target items with path, existence and hash; fetch a target and its reference into /tmp/design-loop; give the studio's /render URL to screenshot) and a capture script (Playwright on the host, like the existing screenshot script): given a Storybook URL + storyId, or an app URL with the optional screensAuth storage state, it captures the rendered DOM (body children, so portalled dialogs and menus are included), gathers the page's stylesheets into design/assets/project.css, rewrites images and fonts to design/assets/<hash>.<ext>, strips scripts, writes the reference page and its design/index.json row, records mockupHash for screens, refuses to overwrite a reference whose hash no longer matches, and warns that screen snapshots contain real dev data and get committed (pointing to the sample-data rule). Each script gets a bash test script next to it.

A /design-studio command (like claude-tools' help-server command, but resolving the ai-dev-tools checkout instead of hardcoding a path) starts or opens the current project's studio container and registers the studio MCP once at project scope. design-init asks which backend; for local it skips the Claude Design prerequisites, creates design/, captures the mapped components and starts the studio. design-loop uses the operations: for local, candidates come from design/proposals, step 3 diffs proposal vs reference (data-studio rules and DOM changes) with no ds-bundle staging, step 7 screenshots the studio render URL, and the palette item skips the card diff because studio saves already wrote the inputs. design-refresh for local treats a component as stale when its sources or story changed since capture, and refreshes by re-capturing (no /design-sync). Update the design contract first, add a local-studio reference doc (counterpart of proposals.md and screens.md), update the plugin README (prerequisites per backend, usage, the command) and rebuild the design-help README, and bump the plugin minor version.

## Acceptance criteria

- [ ] bash tests for the local-backend and capture scripts pass, as do the existing test-plugin-files.sh and test-nav-tag.sh
- [ ] On a sample React + Storybook project: /design-init with local creates design/, captures components and starts the studio; editing a proposal in the studio then running /design-loop implements it, converges on screenshots of the studio render, and writes lastImplementedHash
- [ ] Re-capturing after a code change updates the reference; capture refuses to overwrite an edited reference
- [ ] A project without backend in its manifest runs the Claude Design path unchanged
- [ ] The contract, the backend reference docs, the plugin README and the design-help README describe both backends
- [ ] The design plugin version is bumped (minor) in plugin.json; root skills/ copies are not edited

## Blocked by

- `001-design-studio-core-project-store-mcp-endpoint-docker-live-page-view.md`
