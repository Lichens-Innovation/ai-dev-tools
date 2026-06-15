# Todo

Add /confidence-check and /use-design-check

In the workflow page, I would like the label input to be a large multiline input because the conditions may be long (e.g. 200 words). Make sure that in the diagram, the description is only one line with a max width and text ellipsis so it does not overflows or take too much space.

Create a /session-log page to view the logs that are printed to `<cwd>/.claude/afk_session.log.jsonl`.
On the right side of the page, the log is displayed (as readable text stripped from the json format if possible)
On the left side is a vertical, horizontal «card diagram» where each card represents an instance (agent, main session). When an instance is clicked, the log on the right scrolls down to where this instances started. An instance can appear more than once in the card diagram, if it was called a second time after completing it’s first job. The instance card displays the name of the instance and if it’s job ended in a SUCCESS or a FAILURE.
I also added to the navbar an icon to access the log page.
I made a design of the session-log page in `../../docs/design/log-view.png`.

Is there a way to see exacly the content that is loaded into an agent when it is called ?

## Refactor

Handoff:

- @scribe: If a finding represents a recurring pattern an agent should know going forward, call `@scribe` to make it permanent in the relevant agent file.
- @backend: If a finding requires code changes, delegate to `@backend`.
- @reviewer: If triggered by `@reviewer` on a systemic FAIL, notify `@reviewer` when delegation is complete so it can re-review.

## Reviewer

Handoff:

- If the review is a PASS, set the handoff to `@scribe` for housekeeping and fill up the `scribeHandoff` section.
- If the review is a FAIL because of a code pattern violation or code redundancy, set the handoff to `@refactor` and re-review.
- If the review is a FAIL because of a test, set the handoff to `@test` and re-review.
- If the review is a FAIL for any other category (style, data layer, error handling, security, persistence), set the handoff to `@backend` and re-review.

Boundaries:

- Delegate to `@refactor` on a FAIL verdict when issues are systemic (N+1, DRY violations spanning 3+ files, pattern drift)
- Flag recurring patterns for `@scribe` to make permanent
