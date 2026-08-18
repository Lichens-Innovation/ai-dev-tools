# Rewrite the create-* skills for interactive sessions

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

The guidance for finishing a scaffolded artifact currently exists **twice**: in the four create-\*
skills, and inlined into the prompt the bridge builds. The inlining was not laziness — a slash
command re-entered the skill from the top and re-derived fields the payload already carried, so the
instructions were pasted in instead.

That rule exists **because a headless run has nobody to ask**. It is the same root cause as edit
pre-acceptance, and the pane removed it: the session can ask a real question and get a real answer.
So the skills can be loaded as skills, invoked when relevant, and the inlined copies deleted. One
source of guidance for the app and the terminal both, instead of two that drift apart with nothing
to catch it.

**Each skill must handle both entries.** These files are invoked from the terminal too, where no
scaffold exists:

- *the artifact exists, finish it* — name, location and frontmatter already decided, do not re-ask
- *nothing exists yet* — gather what is missing, then create it

Assuming a scaffold is present is how a terminal session ends up confidently discussing a file
nobody made. Assuming one is absent is how the app's users get asked for a name they already typed.

Rewrite them to ask rather than guess. A skill that needs a decision should put the options in front
of the user, with enough description to choose between them — that facility exists now and these
skills are its first real consumer.

Since these files also serve terminal users, the rewrite changes behaviour outside the app. That is
intended, and it is why this comes last: only once the handoff is working is it clear what the model
actually receives.

## Acceptance criteria

- [ ] The four create-\* skills are loaded as session skills and invoked when relevant
- [ ] The inlined instruction copies are deleted, and the prompt builder no longer duplicates guidance
- [ ] Each skill works from the app, where the artifact already exists and its fields are decided
- [ ] Each skill works from a terminal with no scaffold present, gathering what is missing first
- [ ] Fields the form already captured are never re-asked on the app path
- [ ] Where a skill needs a decision it asks with options rather than guessing or assuming
- [ ] A terminal invocation of each skill is exercised end to end, not only the in-app path
- [ ] The tests that assert no create prompt contains a slash command still hold

## Blocked by

- `022-hand-off-from-a-create-form-into-the-pane.md`
