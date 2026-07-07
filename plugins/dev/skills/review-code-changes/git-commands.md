# Git Commands

## Intent Deduction

```bash
git rev-parse --abbrev-ref HEAD          # branch name often encodes intent (refactor/simplify-auth)
git log <base>..<head> --oneline         # commits on this branch
git log --oneline -10                    # recent commits if branch unknown
```

## Triage Mode

## Explicitly Mentioned Files

```bash
git diff HEAD <file-path>           # diff against HEAD
git diff <branch> <file-path>       # diff against specific branch
git diff --name-only <file-path>    # check if tracked
```

## Branch Comparison

```bash
git rev-parse --abbrev-ref HEAD                    # current branch
git diff <branch1>..<branch2>                      # full diff
git diff <branch1>..<branch2> --name-only          # changed files
git diff <branch1>..<branch2> --stat               # statistics
git merge-base <branch1> <branch2>                 # common ancestor
```

## Staged Files

```bash
git diff --cached                   # full staged diff
git diff --cached --name-only       # list staged files
git diff --cached --stat            # statistics
```
