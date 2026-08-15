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
// there is no other way to add a turn. That is the pane's restatement of the bridge's invariant:
// `claude:run` guarantees the only executable prompts are ones the user was SHOWN; here the only
// prompts are ones the user WROTE. It also resolves no path to the CLI itself (`paneSessionTarget`
// does, inside the SDK module) and imports no `child_process` (`spawnClaudeChild` does) — both so
// the two reviewed lists in `test/isolation.test.ts` stay the length they are.

import { BrowserWindow } from "electron";
import {
  buildReadScope,
  listMarketplaces,
  nodeSettings,
  paneSessionTarget,
  spawnClaudeChild,
  startPaneSession,
  terminateChildGroup,
  PANE_SKILLS,
  PANE_TOOLS,
  type PaneSession,
} from "../core/index.js";
import { bundledPluginDir } from "./bundled-assets.js";
import { IPC_EVENTS } from "../shared/ipc.js";
import type { ClaudeReadScope, SessionEvent, SessionInfo } from "../shared/ipc.js";

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
  extra: Array<{ path: string; note: string }>
): Promise<ClaudeReadScope> {
  const base = { projectRoot, cwd: projectRoot, targets: [], additional: extra };
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
  return describeSession(projectRoot, sessions.get(webContentsId)?.id ?? null);
}

/** The header's answer for a given session id — same fields whether or not one is running. */
export async function describeSession(projectRoot: string, id: string | null): Promise<SessionInfo> {
  const cli = paneSessionTarget();
  return {
    id,
    projectRoot,
    cwd: projectRoot,
    read: await readScopeFor(projectRoot, projectRoot ? additionalDirectories() : []),
    // Empty, and nothing in this slice can add to it. `022` is the first thing allowed to.
    writable: [],
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
  const entry: LiveSession = { id, projectRoot, session: null as unknown as PaneSession, child: null };

  entry.session = startPaneSession({
    cwd: projectRoot,
    bin: cli.bin,
    additionalDirectories: extra.map((d) => d.path),
    // Without this the five names in `PANE_SKILLS` resolve to nothing at all — `settingSources: []`
    // means no installed plugin reaches the session, and the help skill the deleted chat asked for
    // by name is the whole reason `Skill` is in the pane's tool set.
    pluginDir: bundledPluginDir(),
    emit: (event) => send(webContentsId, event),
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

  return describeSession(projectRoot, id);
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
  await entry.session.stop();
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
 */
export function endAllSessions(): void {
  for (const id of [...sessions.keys()]) endSession(id);
}

/** Called when the app quits. A detached process group outlives its parent unless it is killed. */
export function disposeSessions(): void {
  endAllSessions();
}
