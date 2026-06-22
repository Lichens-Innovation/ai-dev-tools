# Add the task-list loader

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

A read path that surfaces the queued AFK task files to the UI. Reading the
`afk-tasks` directory should yield, for each `NNN-*.md` file, its title, its
`Blocked by` references, and the full markdown body — sorted so that numeric
order is a valid execution order. The reader must degrade gracefully when the
directory does not exist yet (return an empty list, never throw).

## Acceptance criteria

- [ ] Files are listed in zero-padded numeric order
- [ ] The first `#` heading becomes the task title
- [ ] `Blocked by` sibling references are parsed into a list
- [ ] A missing `afk-tasks/` directory yields an empty result

## Blocked by

None — can start immediately.
