# Render the task reader page

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

A two-pane reader page at `/maestro-tasks`. The left pane lists every queued task as
a selectable card showing its filename, title, and any `Blocked by` badges. The
right pane renders the selected task's markdown and offers a one-click **Copy
prompt** action that puts `Do the task described in file <path>` on the
clipboard, ready to paste into an `agent: maestro` session.

### Things to verify by eye

- Markdown headings, lists, `inline code`, and fenced blocks all render:

```ts
const prompt = `Do the task described in file ${task.relativePath}`
```

- A GitHub-style checklist renders with real checkboxes (see criteria below).
- A table renders cleanly:

| Pane  | Shows                          |
| ----- | ------------------------------ |
| Left  | task cards + blocked-by badges |
| Right | rendered markdown + copy       |

## Acceptance criteria

- [ ] Selecting a card swaps the rendered task on the right
- [ ] `Blocked by` references appear as badges on the card
- [ ] The Copy prompt button copies the correct file path
- [ ] Empty state shows when no tasks exist

## Blocked by

- `001-add-task-list-loader.md`
