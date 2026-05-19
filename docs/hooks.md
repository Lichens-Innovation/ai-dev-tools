# Hooks

Hooks trigger on specific events during Claude Code execution.

![hooks lifecycle](./images/hooks-lifecycle.svg)

With hooks, you can trigger scripts during the different stages of Claude Code’s lifecycle. This can be usefull to:

- Manage Claude Code tool usage permissions
- Log Claude Code’s actions for monitoring
- Enforce strict guidelines that Claude Code cannot avoid at a given lifecycle stage

Hooks can be complicated, but they can reduce the use of Claude Code by using scripts which do not consume tokens, do not take time and always give the same result. As you refine your understanding of Claude Code’s lifecycle, you will find that a hook at a right place can transform your experience with Claude Code from a frustating experience to a stroll in the park.

Here is an example of a hook that uses 2 scripts to validate that Claude Code uses the right subagent for the job and add a note to the memory to avoid doing the same mistake again if it tries to do so:

Hook: `.claude/settings.json`

```
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/scripts/agent_selection_validation.sh"
          }
        ]
      },
    ],
  }
}

```

Script 1: `.claude/scripts/agent_selection_validation.sh`

```
#!/bin/bash

# Validates that the main Claude session follows the correct agent handoff workflow.
# Called automatically by the PreToolUse hook for the Agent tool in .claude/settings.json.

INPUT=$(cat)
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
AGENT_PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // empty')

if [[ "$SUBAGENT_TYPE" == "backend" ]]; then
    if echo "$AGENT_PROMPT" | grep -qiE '(migration skill|/migration|just migration|just migrate|migrate-new|schema change|add.*table|create.*table|alter.*table)'; then
        REASON='Blocked: use the Skill tool with skill="migration" for schema changes — do not delegate migration work to @backend. The correct sequence is: Skill(migration) → Agent(backend) for propagation only.'
        "$CLAUDE_PROJECT_DIR"/.claude/scripts/update_memory.sh 'Use the Skill tool with skill="migration" for schema changes — do not delegate migration work to @backend. The correct sequence is: Skill(migration) → Agent(backend) for propagation only.'
        jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
        exit 0
    fi

    if echo "$AGENT_PROMPT" | grep -qiE '(write.*test|add.*test|update.*test|fix.*test|create.*test|tests/|just test|@test)'; then
        REASON="Blocked: do not delegate test writing or updates to @backend — that is @test's responsibility. The correct sequence is: Agent(backend) → Agent(test)."
        "$CLAUDE_PROJECT_DIR"/.claude/scripts/update_memory.sh "Do not delegate test writing or updates to @backend — that is @test's responsibility. The correct sequence is: Agent(backend) → Agent(test)."
        jq -n --arg reason "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
        exit 0
    fi
fi

exit 0
```

Script 2: `.claude/scripts/update_memory.sh`

```
#!/bin/bash

# Appends a memory entry to the project's MEMORY.md if it doesn't already exist.
# Usage: update_memory.sh "<entry text>"

ENTRY="$1"
MEMORY_FILE="$HOME/.claude/projects/$(echo "$CLAUDE_PROJECT_DIR" | sed 's|/|-|g')/memory/MEMORY.md"

if [[ -z "$ENTRY" ]]; then
    exit 0
fi

mkdir -p "$(dirname "$MEMORY_FILE")"
touch "$MEMORY_FILE"

if ! grep -qF "$ENTRY" "$MEMORY_FILE"; then
    echo "$ENTRY" >> "$MEMORY_FILE"
fi
```

## JSON Output

Exit codes let you allow or block, but JSON output gives you finer-grained control. Instead of exiting with code 2 to block, exit 0 and print a JSON object to stdout.

> You must choose one approach per hook — either use exit codes alone, or exit 0 and print JSON. Claude Code only processes JSON on exit 0. If you exit 2, any JSON on stdout is ignored.

Your hook's stdout must contain only the JSON object. If your shell profile prints text on startup, it will interfere with JSON parsing.

The JSON object supports three kinds of fields:

- **Universal fields** like `continue` work across all events.
- **Top-level `decision` and `reason`** block an action or provide feedback.
- **`hookSpecificOutput`** is a nested object for events that need richer control. It requires a `hookEventName` field set to the event name.

| Field            | Default | Description                                                                                                                |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `continue`       | `true`  | If `false`, Claude stops processing entirely after the hook runs. Takes precedence over any event-specific decision fields |
| `stopReason`     | none    | Message shown to the user when `continue` is `false`. Not shown to Claude                                                  |
| `suppressOutput` | `false` | If `true`, omits stdout from the debug log                                                                                 |
| `systemMessage`  | none    | Warning message shown to the user                                                                                          |

To stop Claude entirely regardless of event type:

```json
{ "continue": false, "stopReason": "Build failed, fix errors before continuing" }
```

### Add context for Claude

The `additionalContext` field passes a string from your hook into Claude's context window. Claude Code wraps it in a system reminder and inserts it at the point where the hook fired.

Return `additionalContext` inside `hookSpecificOutput` alongside the event name:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptExpansion",
    "additionalContext": "Form data: { \"mode\": \"auto\", \"idea\": \"...\", \"plugin\": \"my-plugin\" }"
  }
}
```

Where the reminder appears depends on the event:

- `SessionStart`, `Setup`, `SubagentStart`: at the start of the conversation, before the first prompt
- `UserPromptSubmit`, `UserPromptExpansion`: alongside the submitted prompt
- `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`: next to the tool result

Use `additionalContext` for information Claude should know about current state — environment, active flags, CI results. For instructions that never change, prefer `CLAUDE.md`.

### Decision control

Not every event supports blocking through JSON. Use this table as a quick reference:

| Events                                                                                                                          | Pattern              | Key fields                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| `UserPromptSubmit`, `UserPromptExpansion`, `PostToolUse`, `PostToolBatch`, `Stop`, `SubagentStop`, `ConfigChange`, `PreCompact` | Top-level `decision` | `decision: "block"`, `reason`                                                   |
| `PreToolUse`                                                                                                                    | `hookSpecificOutput` | `permissionDecision` (`allow`/`deny`/`ask`/`defer`), `permissionDecisionReason` |
| `PermissionRequest`                                                                                                             | `hookSpecificOutput` | `decision.behavior` (`allow`/`deny`)                                            |
| `PermissionDenied`                                                                                                              | `hookSpecificOutput` | `retry: true` to let the model retry                                            |
| `WorktreeRemove`, `Notification`, `SessionEnd`, `PostCompact`, `StopFailure`, `CwdChanged`, `FileChanged`                       | None                 | No decision control — side effects only                                         |

**Top-level `decision`** (used by most events):

```json
{
  "decision": "block",
  "reason": "Test suite must pass before proceeding"
}
```

**`PreToolUse`** (deny with a reason fed back to Claude):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Database writes are not allowed"
  }
}
```

**`PermissionRequest`** (auto-approve on behalf of the user):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" }
  }
}
```

## Debug Hooks

To view the full debug log file of your hook executions details either start claude code with:

- `claude --debug-file <path>` to write the log to a known location
- `claude --debug` and read the log at `~/.claude/debug/<session-id>.txt`

```
[DEBUG] Executing hooks for PostToolUse:Write
[DEBUG] Found 1 hook commands to execute
[DEBUG] Executing hook command: <Your command> with timeout 600000ms
[DEBUG] Hook command completed with status 0: <Your stdout>
```

For more granular hook matching details, set `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` to see additional log lines such as hook matcher counts and query matching.

### Security best practices

Keep these practices in mind when writing hooks:

- **Validate and sanitize inputs**: never trust input data blindly
- **Always quote shell variables**: use `"$VAR"` not `$VAR`
- **Block path traversal**: check for `..` in file paths
- **Use absolute paths**: specify full paths for scripts. In exec form, use `${CLAUDE_PROJECT_DIR}` and the path needs no quoting. In shell form, wrap it in double quotes
- **Skip sensitive files**: avoid `.env`, `.git/`, keys, etc.

### Limitations

- The `PreToolUse` hook cannot be used to inject dynamic content inside a skill — use `UserPromptExpansion` instead, which fires before the skill expands (and before `!` commands run).
- In exec form (when `args` is set), `command` is the raw binary to spawn and is never split by spaces. To run a script through an interpreter, put the interpreter in `command` and the script path in `args`. Setting `"command": "node /path/to/script.cjs"` causes an `ENOENT` error because the whole string is treated as a single binary name.
