# git-regress

Detects semantic regressions across PRs that git's merge conflict detection misses.

## Problem

PR A merges and introduces/depends on symbols (functions, types, interfaces, props). PR B merges 2 days later, deletes those symbols as part of a refactor. Git sees no conflict because different lines were touched. PR A's work is silently broken. No existing tool catches this: not git, not code review agents, not CI.

## How it works

1. On every merged PR, parse the diff's AST using tree-sitter (JS/TS first).
2. Extract a "symbol footprint" per PR:
   - `symbols_added`: new functions, types, interfaces, exported variables, component props introduced
   - `symbols_referenced`: existing symbols that the new code depends on (imports, function calls, type usage)
3. Store footprints in a lightweight JSON file or SQLite db (`.git-regress/` in repo root, gitignored).
4. On every new PR opened or updated, parse the diff again:
   - Extract `symbols_deleted`: symbols removed or renamed
   - Extract `symbols_modified`: symbols whose type signature or interface shape changed
5. Cross-reference `symbols_deleted` and `symbols_modified` against the `symbols_added` and `symbols_referenced` sets from PRs merged in the last 14 days (configurable).
6. If there's overlap, post a PR comment:

```
⚠️ Potential semantic regression detected

This PR deletes `visibleSegments` (prop in MessageEntry.tsx)
  → Referenced by PR #350 (merged 2 days ago by @tony) in ENG-1456

This PR deletes `identifyAgentTurns` (function in helpers.ts)
  → Introduced by PR #350 (merged 2 days ago by @tony) in ENG-1456
  → Referenced by PR #351 (merged 1 day ago by @tony) in ENG-1460

This may silently break functionality from those PRs. Please verify.
```

## Architecture

```
git-regress/
├── src/
│   ├── index.ts              # CLI entry + GitHub Action entry
│   ├── parser/
│   │   ├── ast.ts            # tree-sitter parsing, extract symbols from diff hunks
│   │   └── diff.ts           # git diff parsing, map hunks to files
│   ├── graph/
│   │   ├── footprint.ts      # PR footprint data structure + serialization
│   │   ├── store.ts          # read/write footprint store (JSON or SQLite)
│   │   └── detect.ts         # cross-reference logic: new deletes vs stored footprints
│   ├── reporter/
│   │   ├── github.ts         # post PR comment via GitHub API
│   │   └── cli.ts            # CLI output for local usage
│   └── config.ts             # lookback window, language support, ignore patterns
├── action.yml                # GitHub Action definition
├── package.json
├── tsconfig.json
└── README.md
```

## Symbol extraction scope (v1 — TypeScript/JavaScript only)

Using tree-sitter-typescript, extract:

- **Functions**: named exports, arrow function assignments, method definitions
- **Types/Interfaces**: type aliases, interface declarations, enum declarations
- **Component props**: props type in React components (interface/type used as generic param to FC or as first param)
- **Exports**: what the file exposes (named + default)
- **Imports**: what the file consumes from other files in the repo

For `symbols_deleted`: a symbol is "deleted" if it existed in the base branch version of a file and is absent in the PR's version. Renames count as delete + add (flag the delete side).

For `symbols_referenced`: follow imports within the repo. If PR A adds code that imports `identifyAgentTurns` from `../../lib/helpers`, that symbol goes into the referenced set.

## Storage format (v1 — JSON)

```json
// .git-regress/footprints.json
{
  "pr_350": {
    "number": 350,
    "merged_at": "2025-03-01T12:00:00Z",
    "author": "tony",
    "title": "Turn compaction on new message",
    "symbols_added": [
      { "name": "visibleSegments", "file": "src/components/MessageEntry.tsx", "kind": "prop" }
    ],
    "symbols_referenced": [
      { "name": "identifyAgentTurns", "file": "src/lib/helpers.ts", "kind": "function" },
      { "name": "computeContentSegments", "file": "src/lib/helpers.ts", "kind": "function" }
    ]
  }
}
```

## Usage

### As GitHub Action
```yaml
name: git-regress
on:
  pull_request:
    types: [opened, synchronize]

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

### As CLI
```bash
npx git-regress check          # check current branch against stored footprints
npx git-regress store           # store footprint for current branch/PR
npx git-regress store --pr 350  # store footprint for a specific merged PR
```

## Tech stack

- TypeScript
- tree-sitter + tree-sitter-typescript (via node bindings)
- @octokit/rest for GitHub API
- Commander.js for CLI

## Non-goals for v1

- No AI/LLM usage — pure AST analysis
- No cross-language support (TS/JS only)
- No UI/dashboard
- No historical backfill (only tracks from install onward)
- No monorepo-specific logic

## Success metric

Ship as a working GitHub Action that catches the exact scenario described in the problem statement. If it would have flagged PR #375 as regressing PRs #350 and #351, it works.
