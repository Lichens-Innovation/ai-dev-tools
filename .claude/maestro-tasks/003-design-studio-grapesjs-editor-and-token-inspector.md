# Design studio GrapesJS editor and token inspector

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

Work on branch feat/design-studio. Add visual editing to the design studio's page view with GrapesJS (BSD-3). The canvas iframe loads the project CSS (design/assets/project.css) unparsed as canvas styles so large Tailwind sheets stay fast. A reference opens read only with a Create proposal action (store createProposal); a proposal is fully editable: select, move, resize, edit text, add and remove elements, restyle. Edits are saved as DOM changes plus one page-local <style data-studio> block of rules, so the design loop can read the change as overrides on top of the reference. The Style Manager offers the project's semantic tokens (var(--...)) and spacing scale first for color and size fields. Toolbar: Reference/Proposal toggle, Create proposal, light/dark/side-by-side, Save (Ctrl+S) through store saveProposal with the base hash, and a prompt to reload when the file changes on disk (Claude edited it); a Conflict on save offers reload or overwrite.

Token inspector, a side panel: clicking an element lists every style property that comes from a token, each row showing the property, the token (e.g. --primary, --spacing-md), its resolved value in light and dark, and its source (the class such as bg-noa-primary, or the rule selector). Build it as a pure trace function over the iframe's CSSOM: collect rules whose selectors the element matches, keep the winning declaration per property (specificity, then order, inline last), and follow var() chains through custom properties on :root and [data-theme] so a semantic token shows the scale token it points to (--primary -> --blue-base). A raw value equal to a token's value is flagged 'literal, matches --x'; a value matching no token is flagged 'off-token'. Clicking a token dispatches a 'design-studio:token' window event ({ detail: { token } }) so the palette footer can open it; in a proposal, a token can be swapped for another semantic token, written into the data-studio block. The current selection (page, a stable selector for the element, its outerHTML excerpt and its token trace) is pushed to the server's selection holder so the MCP get_selection tool returns it.

## Acceptance criteria

- [ ] Editing a proposal by hand and saving writes design/proposals/<name>.html with the change in DOM and/or the data-studio style block, and reopening shows the same result
- [ ] A reference cannot be edited; Create proposal makes an editable copy
- [ ] An external write to the open proposal (e.g. via MCP write_page) prompts a reload; a save over it reports the conflict
- [ ] Clicking a button in a snapshot lists its background, text color, radius and padding tokens with light and dark values and sources, including the semantic-to-scale chain
- [ ] Unit tests of the trace function in jsdom cover the cascade winner, a var() chain, a namespaced Tailwind class, and the literal and off-token flags
- [ ] Clicking a token dispatches design-studio:token; swapping a token in a proposal persists after save
- [ ] MCP get_selection returns the selected element's selector, excerpt and token trace
- [ ] Tests and lint for design-studio pass

## Blocked by

- `001-design-studio-core-project-store-mcp-endpoint-docker-live-page-view.md`
