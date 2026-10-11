# Design studio: sketch layer and Make real through a Claude Code channel

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

One design view where the user styles real elements, moves them, adds the project's components (tasks 006 and 007) **and sketches new parts by hand**, then asks Claude to turn the sketch into real components and tokens in place, with one click while their Claude Code session is open.

**1. A sketch layer on every proposal (studio).**
- The proposal view gets a transparent Excalidraw layer (MIT, `@excalidraw/excalidraw`, loaded client-side only) on top of the GrapesJS canvas. Use Excalidraw as a library: it is not forked. One toolbar picks the tool, like Figma: **Select** works on the page (GrapesJS), **Rectangle, Pen, Text, Arrow, Eraser** draw on the sketch layer. The active tool decides which layer gets the mouse and the keyboard. Excalidraw's own UI is hidden except what the tools need. A toggle hides the sketch layer.
- The two layers stay aligned: zoom and scroll are locked together, and side by side shows the sketch over the light editor only.
- Sketch shapes move freely (unlike real elements, which lay out on drop). Each shape, arrow end and text that covers or points to a page element records that element as its anchor (a stable selector, preferring ids), so the note follows the element when the layout moves and says which element it means.
- The sketch is saved next to the proposal as `<proposal>.excalidraw` (Excalidraw's own JSON, so it also opens on excalidraw.com), with the same atomic write and changed-on-disk conflict check as the proposal. A blank page is a new, empty proposal (component or screen, named by the user) with only a sketch on it.

**2. Make real (studio).**
- Select sketch shapes and click **Make real**. The studio records a request: an id, the page, the selected shape ids, a PNG of the selection over the page, and a status (`pending → sent → done | failed`). Requests are kept in `design/requests/` (git-ignored by design-init) and shown on the page as a badge on the shapes, with the status.
- A request carries only ids and file references, never free text taken from the page: the sketch's text is read by Claude as the user's design notes, through MCP.
- MCP gains: `list_sketch_requests`, `get_sketch_request` (the page, the selected shapes as a compact list of type, position, size, text, color, arrows' start and end, anchors, plus the PNG), and `resolve_sketch_request` (done with a short summary, or failed with a reason). When a request is resolved as done, its shapes are removed from the sketch, and the page reloads with the real elements.

**3. The channel (design plugin).**
- The design plugin ships a small stdio MCP **channel server** declared in the plugin, with no runtime dependencies (the plugin has no node_modules: a minimal hand-written stdio JSON-RPC or a single bundled file). It declares `capabilities.experimental['claude/channel']`, one-way (no reply tool, no permission relay), and `instructions` saying events arrive as `<channel source="design" request_id="…" page="…">` and are handled by running the design-sketch skill on that request.
- At start it reads `design.manifest.json` from the working directory. Without a local-backend manifest it stays idle and silent. With one, it follows the studio's `/events` stream at `127.0.0.1:<studio port>` (reconnecting when the studio restarts) and, for each new request, emits `notifications/claude/channel` with `meta: { request_id, page }` (identifier keys only) and a one-line content; the studio marks the request `sent`. It only forwards events from that local studio.
- Delivery is not acknowledged by Claude Code: a request stays `sent` until Claude resolves it, and the studio shows **Copy command** (`/design-sketch <request id>`) as the fallback, so the same request works without the channel.
- During the research preview a non-allowlisted channel only loads with `claude --dangerously-load-development-channels plugin:design@<marketplace>` (interactive sessions only; a confirmation dialog appears). The `/design-studio` command and the docs say how to start a session with it, and that without it Make real falls back to the copied command.

**4. The design-sketch skill (design plugin).**
- New skill `design-sketch` (local backend only; on Claude Design it says so and stops). Given a request id (from the channel or typed), or with none, the pending requests to pick from: read the request through the studio MCP, then replace the sketched area of the proposal with real markup. Use captured component references for anything that is a known component (marked `data-component="<name>"`, as the editor's Components do) and the project's semantic tokens and namespaced classes for the rest, never raw colors or sizes. Notes anchored to existing elements (arrows, "bigger", "move here") are applied to those elements as layout and style changes. Write with `write_page` (with the base hash; on a conflict, re-read and retry once), then `resolve_sketch_request`, and point at `/design-loop` to implement the proposal once the user is happy with it.
- Contract and docs: the design contract and local-studio.md describe the sketch files, anchors, requests and the channel. The skill gets its README and rows in the plugin README ("What's inside", "Use it"), including how to start Claude Code with the channel. Minor version bump of the design plugin.

## Acceptance criteria

- [ ] In a proposal, the user can switch between Select and the sketch tools, draw over the page, and the sketch stays aligned with the page through zoom and scroll; the sketch saves to `<proposal>.excalidraw` and that file opens on excalidraw.com
- [ ] Shapes and arrows over page elements record anchors and stay attached when the element moves
- [ ] A blank page can be created as an empty proposal with a sketch
- [ ] Make real on a selection creates a request with the documented content; MCP `list_sketch_requests`, `get_sketch_request` and `resolve_sketch_request` work and the studio shows each status
- [ ] With Claude Code started with the development channel flag and the plugin installed, clicking Make real makes the open session run design-sketch on that request without typing anything; the proposal updates and the request ends `done`
- [ ] Without the channel, Copy command gives `/design-sketch <id>`, which produces the same result
- [ ] The channel server stays idle in a project without a local-backend manifest, forwards only the local studio's requests, uses identifier-only meta keys and has no runtime dependencies
- [ ] design-sketch output uses tokens and project classes only and marks known components with `data-component`; on Claude Design it stops with an explanation
- [ ] Tests cover the sketch and request stores (paths, atomic writes, conflicts), anchor resolution and the channel server's event forwarding (a test harness speaking stdio JSON-RPC); the studio's test, lint, type check and build pass; the plugin's existing tests pass
- [ ] The contract, local-studio.md, the studio README, the skill README and the plugin README describe the sketch layer, Make real and the channel setup; the plugin's minor version is bumped

## Blocked by

- `007-design-studio-figma-like-moving-copying-and-adding-of-components-in-a-proposal.md`
