// The session pane's owner — one live Claude session per WINDOW, held in main.
//
// SAME OWNERSHIP SHAPE AS THE LOG TAIL, and for the same reasons. One entry per `webContents.id`;
// starting a second for a window stops the first; a project switch ends the session and starts
// NOTHING against the new project; `disposeSessions()` on quit. A renderer that reloads or a
// window that closes must not leave a `claude` running against the user's repo, and the child is
// deliberately a detached process-group leader, so it outlives us unless something kills it.
//
// WHAT THIS MODULE MAY NOT DO. It never composes a prompt. `say` forwards the user's text verbatim
// into the SDK's input stream, stamped `origin: { kind: "human" }` by `startPaneSession`, and
// there is no other way to add a TURN. `handoffToSession` is the near miss and is not an exception:
// it appends context the user has already been shown — a preview they confirmed, phrased by
// `session-handoff.ts` — with `shouldQuery: false`, so it starts no turn, carries no `origin`, and
// asks the model for nothing. What it can add comes off a claimed token; nothing about it is
// supplied by the renderer. That is the pane's restatement of the bridge's invariant:
// `claude:run` guarantees the only executable prompts are ones the user was SHOWN; here the only
// prompts are ones the user WROTE. It also resolves no path to the CLI itself (`paneSessionTarget`
// does, inside the SDK module) and imports no `child_process` (`spawnClaudeChild` does) — both so
// the two reviewed lists in `test/isolation.test.ts` stay the length they are.

import { BrowserWindow } from "electron";
import {
  buildReadScope,
  claimInvocation,
  grantOptionFor,
  handoffNotice,
  handoffSeed,
  handoffTitle,
  listMarketplaces,
  nodeSettings,
  paneSessionTarget,
  permissionReason,
  spawnClaudeChild,
  startPaneSession,
  terminateChildGroup,
  withinDirectory,
  writeScopeNote,
  PANE_SKILLS,
  PANE_TOOLS,
  type PaneSession,
} from "../core/index.js";
import { bundledPluginDir } from "./bundled-assets.js";
import { IPC_EVENTS } from "../shared/ipc.js";
import type {
  ClaudeReadScope,
  PermissionAnswer,
  PermissionChoice,
  PermissionPrompt,
  SessionEvent,
  SessionGrant,
  SessionInfo,
  SessionWrite,
} from "../shared/ipc.js";

/**
 * The child `spawnClaudeChild` produced.
 *
 * Derived from that function rather than imported as `ChildProcess` from `node:child_process`, and
 * that is not stylistic: `test/isolation.test.ts` keeps the list of modules that can start a
 * process short enough to read, and it decides membership by looking for the specifier. A
 * type-only import would put this module on that list while spawning nothing — a false entry on a
 * list whose whole value is that every entry is worth reading.
 */
type ClaudeChild = ReturnType<typeof spawnClaudeChild>;

interface LiveSession {
  id: string;
  projectRoot: string;
  session: PaneSession;
  /** The child the spawn function produced, so the whole GROUP can be signalled on teardown. */
  child: ClaudeChild | null;
  /**
   * The prompts still waiting on a person, by request id.
   *
   * WHY MAIN KEEPS ITS OWN COPY. A grant answers a question about a NAMED path, and the renderer
   * sends only the word `file` or `directory` — so the path has to be recovered on this side of the
   * wire, from the question that was actually asked. Reading it off the event main just sent is what
   * makes "the renderer never nominates a directory" true rather than merely intended.
   */
  prompts: Map<string, PermissionPrompt>;
  /** What a person has granted, in force. Never written anywhere; dies with the entry. */
  grants: SessionGrant[];
  /**
   * What a submitted create-\* form opened for writing, in force. Same lifetime, same absence from
   * disk — and one more property: it can only ever have been appended by a claimed preview token.
   */
  writes: SessionWrite[];
}

/** Keyed by the webContents that asked for it — one session per window, never one per subscriber. */
const sessions = new Map<number, LiveSession>();

let nextId = 0;

/**
 * Sequence numbers for events this module injects rather than reads off the session.
 *
 * Negative and descending, so they can never collide with the session's own ascending counter —
 * the renderer keys transcript entries on `seq`, and two entries sharing one is a dropped line.
 */
let injectedSeq = 0;

/**
 * The trees a session may read beyond its working directory.
 *
 * The open project is the cwd and therefore already in scope; these are the marketplaces the user
 * has registered with Claude Code as `source: "directory"` — the same list the create forms write
 * into, resolved out of `~/.claude/plugins/known_marketplaces.json` by `listMarketplaces()`. A
 * conversation about authoring a skill is a conversation about those repositories, and a session
 * that cannot see the marketplace it is being asked about is one that guesses.
 *
 * A NAME never crosses the process boundary to get here and neither does a path: main resolves the
 * whole list for itself, which is the rule `scaffold.ts` already states — a renderer describes an
 * artifact and never nominates a directory.
 */
function additionalDirectories(): Array<{ path: string; note: string }> {
  return listMarketplaces().map((m) => ({
    path: m.path,
    note: `The "${m.name}" marketplace, registered in ~/.claude/plugins/known_marketplaces.json. Opened by the app.`,
  }));
}

/**
 * What the session can see, in the shape the confirmation dialog already renders.
 *
 * Never throws, for the reason `claude-preview.ts` gives: a cascade that cannot be resolved still
 * produces a scope naming the working directory, with `unresolved` saying why the rest is unknown.
 * Failing here would cost the user the whole pane over a disclosure detail.
 */
async function readScopeFor(
  projectRoot: string,
  extra: Array<{ path: string; note: string }>,
  granted: Array<{ path: string; note: string }> = []
): Promise<ClaudeReadScope> {
  const base = { projectRoot, cwd: projectRoot, targets: [], additional: extra, granted };
  try {
    return buildReadScope({ ...base, settings: await nodeSettings().resolve(projectRoot) });
  } catch (err) {
    return buildReadScope({
      ...base,
      settings: null,
      unresolved: `The settings files on disk could not be read: ${err instanceof Error ? err.message : String(err)}.`,
    });
  }
}

/** What a window's session can see and do right now. Starts nothing; `id` is null when none runs. */
export async function sessionInfo(webContentsId: number, projectRoot: string): Promise<SessionInfo> {
  const entry = sessions.get(webContentsId);
  return describeSession(projectRoot, entry?.id ?? null, entry?.grants ?? [], entry?.writes ?? []);
}

/** How one grant reads in the disclosure, next to the app's own directories. */
function grantNote(grant: SessionGrant): string {
  const what = grant.scope === "file" ? "this file" : "this folder";
  return `You opened ${what} during this session, answering a ${grant.tool} prompt about ${grant.target}. It lasts until the session ends and nothing was written to disk.`;
}

/** How a handed-off write scope reads in the disclosure. It is readable BECAUSE it is writable. */
function writeNote(write: SessionWrite): string {
  return (
    `Opened by the ${write.kind} form you submitted, which scaffolded ${write.artifact}. ` +
    `The session may write ${writeScopeNote(write.scope)} here, and reads it without asking for the same reason. ` +
    `It lasts until the session ends and nothing was written to your settings.`
  );
}

/**
 * The header's answer for a given session id — same fields whether or not one is running.
 *
 * The write scope reaches the disclosure as an `origin: "app"` directory as well as `writes`, and
 * only when nothing already in scope contains it: a skill written into a marketplace the pane
 * already opened is not a new place the session can look, and listing it twice would make the one
 * list that is supposed to answer "what can this see" answer it twice, differently.
 */
export async function describeSession(
  projectRoot: string,
  id: string | null,
  grants: readonly SessionGrant[] = [],
  writes: readonly SessionWrite[] = []
): Promise<SessionInfo> {
  const cli = paneSessionTarget();
  const extra = projectRoot ? additionalDirectories() : [];
  const covered = [projectRoot, ...extra.map((d) => d.path), ...grants.map((g) => g.path)].filter(Boolean);
  const fromWrites = writes
    .filter((w) => !covered.some((root) => withinDirectory(root, w.path)))
    .map((w) => ({ path: w.path, note: writeNote(w) }));

  return {
    id,
    projectRoot,
    cwd: projectRoot,
    read: await readScopeFor(
      projectRoot,
      [...extra, ...fromWrites],
      grants.map((g) => ({ path: g.path, note: grantNote(g) }))
    ),
    grants: [...grants],
    // Empty until a create-* form hands its completed preview over, then one entry per submit.
    // Derived from `writes` rather than tracked beside it, so the flat list and the attributed one
    // cannot come apart.
    writable: writes.map((w) => w.path),
    writes: [...writes],
    tools: [...PANE_TOOLS],
    skills: [...PANE_SKILLS],
    available: cli.available,
    unavailable: cli.unavailable,
  };
}

function send(webContentsId: number, event: SessionEvent): void {
  const wc = BrowserWindow.getAllWindows().find((w) => w.webContents.id === webContentsId)?.webContents;
  if (wc && !wc.isDestroyed()) wc.send(IPC_EVENTS.sessionEvent, event);
}

/**
 * Start a session for one window against the open project.
 *
 * Idempotent per window in the useful sense: an existing session is ENDED first, rather than a
 * second one being started beside it. Two sessions in a window would mean two transcripts, which
 * is the thing the help chat's deletion exists to prevent.
 */
export async function startSession(webContentsId: number, projectRoot: string): Promise<SessionInfo> {
  endSession(webContentsId);
  if (!projectRoot) throw new Error("No project is open.");

  const cli = paneSessionTarget();
  if (!cli.available || !cli.bin) {
    // Not an exception: the pane renders the reason and keeps its Copy-the-command fallback, the
    // same way the confirmation dialog does with no CLI installed.
    return describeSession(projectRoot, null);
  }

  const extra = additionalDirectories();
  const id = `s${++nextId}`;
  const entry: LiveSession = {
    id,
    projectRoot,
    session: null as unknown as PaneSession,
    child: null,
    prompts: new Map(),
    grants: [],
    writes: [],
  };

  entry.session = startPaneSession({
    cwd: projectRoot,
    bin: cli.bin,
    additionalDirectories: extra.map((d) => d.path),
    // Without this the five names in `PANE_SKILLS` resolve to nothing at all — `settingSources: []`
    // means no installed plugin reaches the session, and the help skill the deleted chat asked for
    // by name is the whole reason `Skill` is in the pane's tool set.
    pluginDir: bundledPluginDir(),
    emit: (event) => {
      // Every question is kept until it is answered, because answering a GRANT needs the path the
      // question named and the renderer does not send one. Resolved requests are dropped so the map
      // is bounded by what is actually on screen.
      if (event.kind === "permission") entry.prompts.set(event.request.requestId, event.request);
      if (event.kind === "permission-resolved") entry.prompts.delete(event.requestId);
      send(webContentsId, event);
    },
    spawn: (options) => {
      const child = spawnClaudeChild(options);
      entry.child = child;
      child.on("error", (err: NodeJS.ErrnoException) => {
        send(webContentsId, {
          kind: "notice",
          seq: --injectedSeq,
          text: `Could not run ${options.command}: ${err.message}`,
        });
      });
      return child;
    },
  });

  sessions.set(webContentsId, entry);
  // The child is detached, so a session that ends on its own still has to be reaped.
  void entry.session.ended.then(() => {
    if (sessions.get(webContentsId) === entry) sessions.delete(webContentsId);
    if (entry.child) terminateChildGroup(entry.child);
  });

  return describeSession(projectRoot, id, entry.grants, entry.writes);
}

/**
 * Continue a create-\* form's work in the pane, with the token its confirmation was built from.
 *
 * A TOKEN AND NOTHING ELSE, exactly like `claude:run`, and for the reason the token exists: the
 * invocation names the artifact this process resolved when it built the preview, so a renderer
 * cannot describe a directory for the session to write in any more than it can describe a prompt
 * for the session to run. Claiming consumes it, so a preview is spent either headlessly or here,
 * never both, and never twice.
 *
 * Three things then happen, and they are the same three a grant does — widen the enforcement input,
 * tell the SDK, re-derive the disclosure — plus one that is this slice's own: the conversation is
 * seeded with what was scaffolded, WITHOUT a model turn.
 *
 *   1. `allowWrites` appends the artifact's own directory to the live write scope. Exactly one
 *      entry, whatever the form; a second submit appends a second.
 *   2. `seed` appends the context as a non-querying message. It costs nothing until the user types,
 *      and it is what stops the model re-asking for the name the form captured.
 *   3. The addition is announced inline in the transcript and the header re-reads the scope from
 *      the `scope` event, so what the boundary enforces and what the pane says cannot drift.
 *
 * Telling the SDK is the one step that cannot happen here: `updatedPermissions` rides on a
 * permission answer and there is no answer to ride on, so `startPaneSession` carries it to the
 * first tool call that lands inside the new directory. See `unannounced` there.
 */
export async function handoffToSession(
  webContentsId: number,
  projectRoot: string,
  token: unknown
): Promise<SessionInfo> {
  if (!projectRoot) throw new Error("No project is open.");
  // Throws `TokenRefused` on a forged, replayed, expired or mis-aimed token — the same refusal, with
  // the same reasons, that the run channel gives.
  const invocation = claimInvocation(token, "claude");
  const handoff = invocation.handoff;
  if (!handoff) {
    throw new Error(
      "That preview cannot be continued in the pane: it did not come from a create-* form, so there is no " +
        "artifact whose directory the session could be given."
    );
  }

  // Reuse the conversation the user already has, unless there is none or it belongs to a project
  // this window has moved off. A handoff is an addition to a session, not a new one — that is what
  // makes a second submit grow the scope by one rather than replace it.
  let entry = sessions.get(webContentsId);
  if (!entry || entry.projectRoot !== projectRoot) {
    await startSession(webContentsId, projectRoot);
    entry = sessions.get(webContentsId);
  }
  if (!entry) {
    // No CLI on this machine: `startSession` returned a description rather than a session, and there
    // is nothing to hand off into. The artifact is still on disk and the dialog still copies the
    // prompt, which is the documented fallback in exactly this state.
    return describeSession(projectRoot, null);
  }

  const added = entry.session.allowWrites([handoff.writeScope]);

  // ONE STRING, TWO DESTINATIONS. What the model is given and what the transcript shows are the
  // same text, built once — a transcript that paraphrased what was actually seeded would be the
  // one thing worse than not showing it at all.
  const seed = handoffSeed(handoff, invocation.prompt);
  entry.session.seed(seed);
  send(webContentsId, { kind: "context", seq: --injectedSeq, title: handoffTitle(handoff), text: seed });

  if (added.length > 0) {
    entry.writes.push({
      path: handoff.writeScope,
      scope: handoff.scope,
      artifact: handoff.artifact,
      kind: handoff.kind,
      name: handoff.name,
      addedAt: Date.now(),
    });
    send(webContentsId, { kind: "notice", seq: --injectedSeq, text: handoffNotice(handoff) });
  } else {
    // A second submit for the same artifact. Saying so beats a silent no-op: the user pressed a
    // button that describes itself as opening a directory, and it did not open a second one.
    send(webContentsId, {
      kind: "notice",
      seq: --injectedSeq,
      text: `${handoff.writeScope} was already writable in this session, so nothing was added to the write scope.`,
    });
  }

  await announceScope(webContentsId, entry);
  return describeSession(projectRoot, entry.id, entry.grants, entry.writes);
}

/**
 * Tell the window the read scope moved.
 *
 * THE SECOND HALF OF A GRANT, and the one with nothing to make it happen automatically. `020`
 * resolved the readable set once at session start, so widening the boundary without re-deriving the
 * disclosure leaves the header describing a session that no longer exists — and nothing fails. This
 * is why a grant is an event rather than a return value: the pane's header re-reads what it can see
 * from the same derivation the boundary uses, not from what a button click implied.
 */
async function announceScope(webContentsId: number, entry: LiveSession): Promise<void> {
  const info = await describeSession(entry.projectRoot, entry.id, entry.grants, entry.writes);
  // The session may have gone away while the settings cascade was being resolved.
  if (sessions.get(webContentsId) !== entry) return;
  send(webContentsId, {
    kind: "scope",
    seq: --injectedSeq,
    read: info.read,
    grants: info.grants,
    writable: info.writable,
    writes: info.writes,
  });
}

/**
 * Add a turn.
 *
 * The text is the user's, verbatim — this function's entire job is to not be a prompt builder.
 * Returns false when the id names no live session, which is what the renderer shows rather than
 * silently dropping a message the user typed.
 */
export function saySession(webContentsId: number, id: string, text: string): boolean {
  const entry = sessions.get(webContentsId);
  if (!entry || entry.id !== id) return false;
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  return entry.session.say(trimmed);
}

/** Interrupt the turn in flight. The session stays usable — this is not Stop-the-session. */
export async function stopSession(webContentsId: number, id: string): Promise<boolean> {
  const entry = sessions.get(webContentsId);
  if (!entry || entry.id !== id) return false;
  const { stillQueued } = await entry.session.stop();
  // A Stop that left messages queued is not the Stop the user pressed the button for: each one runs
  // as its own turn the moment the interrupt lands. Saying so beats a pane that goes quiet and then
  // starts talking again for no visible reason.
  if (stillQueued.length > 0) {
    send(webContentsId, {
      kind: "notice",
      seq: --injectedSeq,
      text: `Stopped the turn in flight. ${stillQueued.length} queued message${
        stillQueued.length === 1 ? "" : "s"
      } survived the interrupt and will still run.`,
    });
  }
  return true;
}

/**
 * The main process authors the answer; the renderer sends a choice.
 *
 * The narrow wire shape (`PermissionChoice`) is what keeps `updatedPermissions` — blanket allow
 * rules, `bypassPermissions`, a permanently widened read scope, written to the user's own settings
 * files — unreachable from the renderer. What crosses is one of three words plus a sentence, and
 * this function is the only place a `PermissionAnswer` is built from it.
 *
 * The reason is never empty. The UI is written not to send one, and this is the second half of that
 * promise rather than a restatement of it: a deny whose message is `""` reaches the model as a bare
 * refusal, and the model reads denial messages to decide what to do instead.
 */
export async function answerPermission(
  webContentsId: number,
  id: string,
  requestId: string,
  choice: PermissionChoice
): Promise<boolean> {
  const entry = sessions.get(webContentsId);
  if (!entry || entry.id !== id) return false;

  if (choice?.choice === "grant") return grantAndAllow(webContentsId, entry, String(requestId ?? ""), choice.scope);

  const answer: PermissionAnswer =
    choice?.choice === "allow"
      ? { behavior: "allow" }
      : {
          behavior: "deny",
          message: permissionReason(
            choice?.reason,
            choice?.choice === "stop"
              ? "The user stopped this turn rather than allowing that call."
              : "The user declined this call. Do not retry it; say what you needed it for instead."
          ),
          // Deny and Stop are two controls: a plain deny lets the model adapt and finish the job,
          // and this one ends the turn. Only a person ever sets it.
          interrupt: choice?.choice === "stop",
        };

  return entry.session.answer(String(requestId ?? ""), answer);
}

/**
 * Allow this call, and stop asking about this path for the rest of the session.
 *
 * THREE THINGS HAPPEN HERE, and leaving out any one of them produces a boundary that is wrong in a
 * way nothing reports:
 *
 *   1. **The hook's list is widened.** It runs before the permission flow and would otherwise route
 *      the same path into a prompt on the very next call — the grant would appear to have done
 *      nothing.
 *   2. **The answer carries `updatedPermissions`.** `destination: "session"` and nothing else: the
 *      CLI stops prompting for the tree, and NO FILE IS WRITTEN. `localSettings` would land a rule
 *      in the user's repository, `userSettings` on their whole machine, and both would outlive the
 *      conversation the user was actually asked about. `SessionPermissionUpdate` cannot express
 *      either, which is where that guarantee lives.
 *   3. **The disclosure is re-derived.** The header and the boundary have to agree, and the header
 *      has no other way to learn that they stopped agreeing.
 *
 * The PATH comes from the prompt this answers, never from the renderer. A `scope` naming no option
 * on that prompt grants nothing and falls back to letting the one call through, which is the safe
 * direction to be wrong in: the user pressed a button meaning "yes".
 */
async function grantAndAllow(
  webContentsId: number,
  entry: LiveSession,
  requestId: string,
  scope: string
): Promise<boolean> {
  const prompt = entry.prompts.get(requestId);
  const option = grantOptionFor(prompt?.grants ?? [], scope);
  if (!option) return entry.session.answer(requestId, { behavior: "allow" });

  const added = entry.session.grant([option.path]);
  const answered = entry.session.answer(requestId, {
    behavior: "allow",
    updatedPermissions: [{ type: "addDirectories", directories: [option.path], destination: "session" }],
  });

  if (!answered) {
    // The request was already resolved — a double click, or the session going away underneath it.
    // The boundary must not stay widened for a question nobody answered.
    for (const path of added) entry.session.revoke(path);
    return false;
  }

  entry.grants.push({
    path: option.path,
    scope: option.scope,
    target: prompt?.target ?? option.path,
    tool: prompt?.tool ?? "a tool",
    grantedAt: Date.now(),
  });
  send(webContentsId, {
    kind: "notice",
    seq: --injectedSeq,
    text: `${option.path} is readable for the rest of this session. Nothing was written to disk; revoke it from the scope panel (the eye icon) at any time.`,
  });
  await announceScope(webContentsId, entry);
  return true;
}

/**
 * Take a grant back.
 *
 * The renderer sends a PATH here and that is not a hole: this call can only ever REMOVE an entry
 * that is already in `entry.grants`, so a path it does not recognise does nothing at all. There is
 * no shape of argument by which it could widen anything.
 *
 * What it can actually undo is this app's own boundary — the SDK has no API for withdrawing a
 * `PermissionUpdate` — and that is enough, because the hook runs first: a path the hook stops
 * recognising is routed back into a prompt before the CLI's permission system is ever consulted.
 */
export async function revokeGrant(webContentsId: number, id: string, target: string): Promise<boolean> {
  const entry = sessions.get(webContentsId);
  if (!entry || entry.id !== id) return false;

  const at = entry.grants.findIndex((g) => g.path === target);
  if (at < 0) return false;

  entry.grants.splice(at, 1);
  entry.session.revoke(target);
  send(webContentsId, {
    kind: "notice",
    seq: --injectedSeq,
    text: `${target} is out of scope again. The session can no longer read it without asking.`,
  });
  await announceScope(webContentsId, entry);
  return true;
}

/**
 * End a window's session and reap its child.
 *
 * Three steps, exactly as `cancelClaudeRun` documents and for the same reason: closing the query
 * ends the conversation and releases the child the SDK is holding, signalling the process GROUP is
 * what reaches the CLI's own children, and SIGKILL follows if anything is still there.
 */
export function endSession(webContentsId: number): void {
  const entry = sessions.get(webContentsId);
  if (!entry) return;
  sessions.delete(webContentsId);
  entry.session.close();
  if (entry.child) terminateChildGroup(entry.child);
}

/**
 * A project switch ends every session and starts nothing.
 *
 * NOT a retarget, unlike the log tail beside it. A tail has no state to lose and a conversation
 * does: silently re-pointing a transcript about repository A at repository B would be worse than
 * losing it, and starting a session implicitly would spend the user's subscription on a project
 * they have only just opened.
 *
 * IT IS ALSO WHAT CLEARS THE WRITE SCOPE. The accumulated directories live on the entry and in the
 * session's own closure, so ending the session is the only way they go — there is no revoke, and
 * none is owed: each entry answers a form the user submitted, and the way to withdraw that consent
 * is to end the conversation it was given to. A switch does both at once.
 */
export function endAllSessions(): void {
  for (const id of [...sessions.keys()]) endSession(id);
}

/** Called when the app quits. A detached process group outlives its parent unless it is killed. */
export function disposeSessions(): void {
  endAllSessions();
}
