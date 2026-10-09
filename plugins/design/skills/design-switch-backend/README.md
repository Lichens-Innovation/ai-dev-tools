# design-switch-backend

Moves a project's design loop to the other backend: from Claude Design to the local design studio, or back. Only the user can start it.

- `/design-switch-backend` (or `/design-switch-backend to local`): checks for proposals not implemented yet and offers to implement them first, shows the manifest change and asks before writing it, offers to stop the studio and remove its MCP server when leaving local, then hands over to `/design-init` to set the new backend up.
- `scripts/switch-backend.mjs plan|apply <claude-design|local>` rewrites `design.manifest.json`: the code side is kept, the design paths become the new backend's, and every item goes back to `wip` with no implemented hash. Test: `bash scripts/test-switch-backend.sh`.

The old backend's references, mockups and proposals are not converted: they stay in the Claude Design project or the repo's `design/` folder.
