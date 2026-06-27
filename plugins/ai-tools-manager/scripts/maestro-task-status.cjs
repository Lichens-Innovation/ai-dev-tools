#!/usr/bin/env node
// Maestro task-status tracker. Sole writer of
// <cwd>/.claude/maestro-tasks/status.json — the committed source of truth for
// each task's state (done/ready/blocked) and dependency graph.
//
//   node maestro-task-status.cjs sync
//       Reconcile status.json with the task files on disk: add new NNN-*.md,
//       drop deleted ones, refresh blockedBy from each file's "## Blocked by"
//       section, preserve done, recompute every ready/blocked. Idempotent.
//       Run by /to-maestro-tasks after generating task files.
//
//   node maestro-task-status.cjs done <filename>
//       Mark one task done (e.g. "002-add-login.md"), then recompute the
//       cascade so dependents whose blockers are now all done flip to ready.
//       Run by the /maestro orchestrator after a task-file run fully succeeds.
//
// All cascade/status logic lives in lib/maestro-tasks.cjs so the app and the
// orchestrator share one implementation. Self-contained: maestro-install.js
// copies this file and the lib into the project's .claude/scripts/.

const path = require("path");
const { sync, markDone } = require("./lib/maestro-tasks.cjs");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const [command, arg] = process.argv.slice(2);

function counts(map) {
  const c = { done: 0, ready: 0, blocked: 0 };
  for (const k of Object.keys(map)) {
    const s = map[k] && map[k].status;
    if (s in c) c[s] += 1;
  }
  return c;
}

function summary(map) {
  const c = counts(map);
  return `${Object.keys(map).length} task(s): ${c.done} done, ${c.ready} ready, ${c.blocked} blocked`;
}

try {
  if (command === "sync") {
    const map = sync(projectDir);
    process.stdout.write(`Maestro tasks: synced — ${summary(map)}\n`);
    process.exit(0);
  }

  if (command === "done") {
    if (!arg) {
      process.stderr.write('maestro-task-status: "done" needs a task filename, e.g. done 002-add-login.md\n');
      process.exit(1);
    }
    const filename = path.basename(arg); // tolerate a path; key on the bare filename
    const { map, marked } = markDone(projectDir, filename);
    if (!marked) {
      process.stderr.write(
        `maestro-task-status: no task file "${filename}" under .claude/maestro-tasks/ — nothing marked done\n`
      );
      process.exit(1);
    }
    process.stdout.write(`Maestro tasks: marked "${filename}" done — ${summary(map)}\n`);
    process.exit(0);
  }

  process.stderr.write(
    "maestro-task-status: unknown command. Usage:\n  maestro-task-status.cjs sync\n  maestro-task-status.cjs done <filename>\n"
  );
  process.exit(1);
} catch (err) {
  process.stderr.write(`maestro-task-status: ${err.message}\n`);
  process.exit(1);
}
