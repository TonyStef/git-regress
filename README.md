<p align="center">
  <img src="ok.svg" width="80" height="80" alt="git-regress" />
</p>

# git-regress

Detects semantic regressions across PRs that git's merge conflict detection misses.

PR A merges and introduces symbols (functions, types, interfaces). PR B merges days later, deletes those symbols as part of a refactor. Git sees no conflict because different lines were touched. PR A's work is silently broken. `git-regress` catches this.

## How it works

1. On every merged PR, parses the diff using tree-sitter (JS/TS) and extracts a **symbol footprint** — what the PR added and what existing symbols it depends on.
2. On every new PR, parses the diff again to find **deleted or modified symbols**.
3. Cross-references deletions against recently merged footprints.
4. If there's overlap, flags it in the terminal or posts a PR comment.

```
Warning: Potential semantic regression detected

This PR deletes `visibleSegments` (prop in MessageEntry.tsx)
  -> Referenced by PR #350 (merged 2 days ago by @tony) -- Turn compaction on new message

This PR deletes `identifyAgentTurns` (function in helpers.ts)
  -> Introduced by PR #350 (merged 2 days ago by @tony) -- Turn compaction on new message
  -> Referenced by PR #351 (merged 1 day ago by @tony) -- Agent turn detection

This may silently break functionality from those PRs. Please verify.
```

## Prerequisites

- [Bun](https://bun.sh) (v1.0+) for development
- Node.js 18+ (for tree-sitter native bindings and GitHub Actions runtime)

> **This project uses Bun.** Do not use `npm`, `npx`, `yarn`, or `pnpm`. All commands below assume `bun`.

## As GitHub Action (recommended)

Add a single workflow file to your repo. The action auto-detects the event type:

- **On `push` to main** (PR merge) → stores the merged PR's symbol footprint in the GitHub Actions cache
- **On `pull_request`** → checks the PR for regressions, posts a comment if issues are found

```yaml
name: git-regress
on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main]

jobs:
  regress:
    runs-on: ubuntu-latest
    permissions:
      contents: read         # needed to checkout and read the repo
      pull-requests: write   # needed to post PR comments
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: your-org/git-regress@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. One step, fully automatic.

### Action inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | **(required)** | GitHub token with `pull-requests:write` permission |
| `base-branch` | `main` | Base branch to compare against |
| `lookback-days` | `14` | How many days back to check for recently merged PRs |
| `mode` | *(auto)* | Force `check` or `store` mode. Leave empty to auto-detect from event type. |
| `pr-number` | *(auto)* | PR number. Auto-detected from event payload, merge commit message, or GitHub API. |

### Action outputs

| Output | Description |
|---|---|
| `mode` | The mode that ran: `store` or `check` |
| `regression-found` | `true` if regressions were detected (check mode only) |
| `regression-count` | Number of regressions found (check mode only) |
| `pr-number` | The PR number that was processed |

### How storage works

Footprints are persisted using the **GitHub Actions cache**. No files are committed to your repo, no branch protection rules are affected.

When a PR merges, the action:

1. Restores existing footprints from the cache
2. Parses the merge diff to extract the symbol footprint
3. Saves the updated footprints back to the cache

Old footprints beyond the lookback window are automatically pruned to keep the cache small. Works with any branch protection setup — no `contents:write` permission needed.

### Using outputs

```yaml
- uses: your-org/git-regress@v1
  id: regress
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

- if: steps.regress.outputs.regression-found == 'true'
  run: echo "Found ${{ steps.regress.outputs.regression-count }} regression(s)"
```

## CLI

```bash
# Store footprint for a merged PR
bun run git-regress store --pr 350 --base main

# Check current branch against stored footprints
bun run git-regress check --base main --lookback 14
```

## AI agent support

If a regression is flagged in your PR and you're using an AI coding agent, point it at `FOR_AI.md` in this repo. It explains what git-regress is, what the warnings mean, and how to resolve them — written specifically for LLM consumption.

## Development

```bash
bun install          # install dependencies
bun run build        # compile TypeScript + bundle with ncc
bun run typecheck    # type-check without emitting
bun run test         # run tests
bun run test:watch   # run tests in watch mode
bun run lint         # Biome linting
bun run lint:fix     # auto-fix lint issues
```

## Architecture

```
src/
├── index.ts              # CLI entry (Commander.js) + GitHub Action dispatch
├── action.ts             # GitHub Action orchestration (auto-detect, store, check)
├── core.ts               # Shared store/check logic used by both CLI and Action
├── config.ts             # Configuration defaults and file type detection
├── git.ts                # Git command wrappers (diff, show, log)
├── parser/
│   ├── ast.ts            # tree-sitter symbol extraction from source files
│   └── diff.ts           # Unified diff parsing, line number tracking
├── graph/
│   ├── footprint.ts      # PR footprint types (SymbolRef, PRFootprint)
│   ├── store.ts          # JSON persistence (.git-regress/footprints.json)
│   └── detect.ts         # Cross-reference: deletions vs stored footprints
└── reporter/
    ├── cli.ts            # Terminal output formatting
    └── github.ts         # PR comment posting via Octokit
```

## Language support

v1 supports TypeScript and JavaScript only (`.ts`, `.tsx`, `.js`, `.jsx`).

Symbols extracted: functions, types, interfaces, enums, classes, variables, exports, and imports.

## License

MIT
