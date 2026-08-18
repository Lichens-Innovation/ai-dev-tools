# Structured questions from the agent

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The pane's headline feature, and the reason it exists at all: when Claude needs a decision, it asks
a real question with real options instead of guessing. "Which of these three frontmatter shapes do
you want" becomes a rendered choice with a description and a preview per option, not a paragraph of
prose the user has to answer in prose.

A question arrives through the **same channel as a permission request** and is nothing like one.
Rendering it as "Claude wants to use a tool — Allow / Deny" would be absurd, so the callback
branches on the tool and hands questions to their own component. Note that questions reach the host
even when a rule would otherwise auto-approve them — by definition they need a human, so they cannot
be configured away.

Previews are opt-in: without declaring the preview format at session start, no previews are emitted
at all and the option list arrives bare.

**`AskUserQuestion` is still not in the tool set, and this slice is where it arrives.** `018` shipped
`SESSION_TOOLS` in `src/core/agent-sdk.ts` as `Read, Glob, Grep, TodoWrite, WebSearch, WebFetch,
Edit, Write`, leaving `AskUserQuestion` and `Skill` out deliberately: the form path is headless, so a
question has nobody to answer it.

### What `019` already built, and what it deliberately did not

**`019` added `Skill` and only `Skill`** — `PANE_TOOLS = [...SESSION_TOOLS, "Skill"]` in
`agent-sdk.ts`. It did **not** add `AskUserQuestion`, and that was a decision rather than an
oversight: nothing in `019` can render a structured question, and an offered-then-refused tool costs
turns to argue with where an unoffered one costs nothing. So this slice owns **both** mechanical
preconditions, and neither exists anywhere in the app today:

- adding `AskUserQuestion` to `PANE_TOOLS` — extend that constant, do not declare a third list; and
- passing `toolConfig: { askUserQuestion: { previewFormat: 'markdown' } }`, which is **not passed
  anywhere** at present. Without it Claude emits no previews at all and the option list arrives bare.

If a question never arrives, check those two before anything else. Note also that `018` uses
`tools`/`disallowedTools` and never `allowedTools`, which auto-approves without restricting — a
question routed through `allowedTools` would be answered by the SDK instead of by the user. And
`020` owns the callback branch this slice hangs a component off; the permission prompt is where the
tool-name branch lives.

**The answer travels back through the field this app otherwise refuses to expose**, and that
collision needs an explicit, checkable carve-out rather than an exception. The renderer sends a
*selection* — which question, which option labels — and the main process constructs the payload,
**validating that every label it is about to send was present in the options it received**. Anything
else is rejected. That makes the carve-out provable rather than trusted, and it is the same shape as
the preview token: a decision crosses the boundary, never a payload.

Keep the freeform reply. A user who disagrees with every option should be able to say so, and typed
text is exactly what the pane is already allowed to carry.

Support multiple selection where the question asks for it, and make it obvious which questions
accept several answers and which take one.

## Acceptance criteria

- [ ] A question renders as a structured choice with per-option descriptions and previews, distinct from a permission prompt
- [ ] Previews are enabled at session start, and appear
- [ ] Answering sends only a selection; the main process builds the payload
- [ ] A label that was not among the options offered is rejected rather than forwarded — asserted directly
- [ ] Multi-select questions accept several answers, and single-select ones do not
- [ ] A freeform reply reaches the model in place of a structured answer
- [ ] Dismissing the pane or switching projects with a question outstanding resolves it rather than wedging the session
- [ ] The isolation tests fail if the renderer gains the ability to author the payload directly

## Blocked by

- `020-permission-prompts-in-the-pane.md`
