# A live session in the pane, read-only

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The first conversation the app can actually hold. One live, multi-turn session per open project,
rendered in a resizable right-hand pane that shifts the layout rather than covering it — on the
create-\* routes it takes the file-preview column, because once authoring has begun the conversation
is the more useful thing to have beside the form.

**This slice deletes the help chat.** Its panel, its context provider, its request kind and its
flag set all go. Two conversational surfaces would mean two transcripts and two consent models, and
the chat's whole design rests on re-sending capped history in every prompt precisely because it has
no session. The one thing the pane inherits is the help skill the chat asks for by name, now
declared as a session skill rather than named in a prompt string.

**It is read-only, and that is what makes it safe to ship before permission prompts exist.** The
write scope starts empty and only a later slice can grow it. The session can read the open project
and the resolved marketplace and nothing else; anything outside is denied by a pre-tool boundary
check with a reason the model can adapt to.

Structural decisions that are not details:

- The session lives in the main process, one per window, retargeted on project switch and disposed
  on quit — the same ownership shape as the log tail.
- Conversation state lives above the router outlet, not in the panel. The top bar remounts on every
  navigation, so a transcript held in the panel would be discarded the moment the user opened
  another route, and the handle on a run in flight would go with it.
- Input must be a stream the app yields into, not a single string. A string prompt gives a one-shot
  query with no way to add a turn and no working Stop. Deciding this later means rewriting the
  message pump.
- A user turn is stamped as human-authored. The session treats an unattributed turn differently, and
  this is what makes "the user writes the prompts, not the renderer" enforceable rather than
  merely intended.
- The read loop ends on the session's own result message, not on the first quiet moment.

The read scope is not a new idea by the time you get here: `017` added `ClaudeReadScope` /
`ClaudeReadDirectory` / `SettingsPort` to `src/core/contracts.ts`, derived by
`src/core/read-scope.ts` and rendered by `components/read-scope.tsx`. Extend those shapes for the
pane rather than inventing a second notion of "what this session can see" — including for the
header, which needs to show the same thing the confirmation already shows.

Reuse the existing humanizer for rendering tool calls. Do **not** reuse the log view's instance
segmentation: it reads a hook-written file with different shapes and correlates by agent, and
forcing a live message stream through it will mislead.

## Acceptance criteria

- [ ] A multi-turn conversation runs in the pane, per project, with streamed output and a working Stop mid-turn
- [ ] The pane is resizable, shifts the layout rather than overlaying it, and takes the preview column on create routes
- [ ] The help chat and its request kind are deleted; the help skill is still reachable by name
- [ ] The session can read the open project and the resolved marketplace; a read outside both is denied with a visible reason
- [ ] The session cannot write anywhere — the write scope is empty and there is no path to add to it yet
- [ ] Navigating between routes mid-turn loses neither the transcript nor the ability to stop the run
- [ ] Switching projects ends the session and starts nothing against the new project implicitly
- [ ] Closing the window mid-turn leaves no surviving process
- [ ] Tool calls render humanized rather than as raw payloads

## Blocked by

- `018-run-create-authoring-on-the-agent-sdk.md`
