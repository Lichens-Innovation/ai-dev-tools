# git

Git and version control tools and skills for Claude Code.

## What's inside

- `generate-pr-description` skill: builds a PR title and description from the branch diff, fills the PR template, fetches Jira ticket links, adds screenshots when the PR changes the UI, and creates or updates the PR with `gh`.
- `generate-release-report` skill: builds a customer-facing release report PDF from the PRs in `dev` that are not yet in `main`, reusing their screenshots.

## Use it

Install the plugin, then ask for what you need; both skills are invoked explicitly.

```
claude plugin install git@lichens-ai-dev-tools
```

```
/generate-pr-description tickets: PROJ-123
/generate-release-report version 1.5.0
```
