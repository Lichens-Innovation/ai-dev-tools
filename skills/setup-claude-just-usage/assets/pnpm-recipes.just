# Starter recipes for a pnpm repository. Offer only the ones the level's package.json can back
# (see SKILL.md step 3). Append to the level's justfile; keep the doc comments (they show in `just --list`).

# Install workspace dependencies
install:
    pnpm install

# Run the dev server
dev:
    pnpm dev

# Build every package and app
build:
    pnpm build

# Lint
lint:
    pnpm lint

# Check formatting
check:
    pnpm check

# Type-check
typecheck:
    pnpm typecheck

# Run the tests
test:
    pnpm test

# Write formatting
format:
    pnpm format

# Fix vulnerabilities from `pnpm audit`; `just audit -i` picks the updates interactively
[arg("interactive", short="i", long="interactive", value="--interactive")]
audit interactive="":
    pnpm audit --fix=update {{interactive}}
