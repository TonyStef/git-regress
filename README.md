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
⚠️ Potential semantic regression detected

This PR deletes `visibleSegments` (prop in MessageEntry.tsx)
  → Referenced by PR #350 (merged 2 days ago by @tony) — Turn compaction on new message

This PR deletes `identifyAgentTurns` (function in helpers.ts)
  → Introduced by PR #350 (merged 2 days ago by @tony) — Turn compaction on new message
  → Referenced by PR #351 (merged 1 day ago by @tony) — Agent turn detection

This may silently break functionality from those PRs. Please verify.
```

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Node.js 18+ (for tree-sitter native bindings)

> **This project uses Bun.** Do not use `npm`, `npx`, `yarn`, or `pnpm`. All commands below assume `bun`.

## Setup

```bash
bun install
bun run build
```

## Usage

### CLI

```bash
# Store footprint for a merged PR
bun run git-regress store --pr 350 --base main

# Check current branch against stored footprints
bun run git-regress check --base main --lookback 14
```

### As GitHub Action

```yaml
name: git-regress
on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: <owner>/git-regress@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          lookback-days: 14
```

## Development

```bash
bun install          # install dependencies
bun run build        # compile TypeScript
bun run typecheck    # type-check without emitting
bun run test         # run tests
bun run test:watch   # run tests in watch mode
```

## Architecture

```
src/
├── index.ts              # CLI entry (Commander.js) + GitHub Action orchestration
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
