# Starter recipes for a pnpm repository. Offer only the ones the level's package.json can back
# (see SKILL.md step 3). Append to the level's justfile; keep the doc comments (they show in `just --list`).
#
# build, lint, check, typecheck, test and format run through `_quiet` (below, added once with the first
# of them): the output goes to a log file, a success prints one line plus the last 3 lines of output, a
# failure prints the last 80 lines and the log path. This keeps Claude's context small. `FULL_OUTPUT=1 just test`
# streams everything.

# Install workspace dependencies
install:
    pnpm install

# Run the dev server
dev:
    pnpm dev

# Build every package and app
build: (_quiet "build" "pnpm build")

# Lint
lint: (_quiet "lint" "pnpm lint")

# Check formatting
check: (_quiet "check" "pnpm check")

# Type-check
typecheck: (_quiet "typecheck" "pnpm typecheck")

# Run the tests
test: (_quiet "test" "pnpm test")

# Write formatting
format: (_quiet "format" "pnpm format")

# Fix vulnerabilities from `pnpm audit`; `just audit -i` picks the updates interactively
[arg("interactive", short="i", long="interactive", value="--interactive")]
audit interactive="":
    pnpm audit --fix=update {{interactive}}

# Run a command quietly: only a summary on success, the tail of the output and the log path on failure
[private]
[no-exit-message]
_quiet label cmd:
    #!/usr/bin/env bash
    if [ -n "${FULL_OUTPUT:-}" ]; then {{cmd}}; exit $?; fi
    log="$(mktemp "${TMPDIR:-/tmp}/just-{{label}}.XXXXXX")"
    if { {{cmd}}; } >"$log" 2>&1; then
        echo "ok: {{label}} passed ($(wc -l <"$log" | tr -d ' ') lines of output hidden). Last lines:"
        tail -n 3 "$log"
        rm -f "$log"
    else
        status=$?
        echo "FAILED: {{label}} (exit $status). Last 80 lines of output:"
        tail -n 80 "$log"
        echo "Full log: $log"
        exit "$status"
    fi
