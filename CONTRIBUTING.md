# Contributing to git-regress

This project uses **Bun** exclusively. Do not use npm, npx, yarn, or pnpm.

## Setup

```bash
git clone <repo>
cd git-regress
bun install
bun run build
```

## Commands

```bash
bun run build        # compile TS + bundle with ncc + copy WASM files
bun run typecheck    # type-check without emitting
bun run test         # 21 tests (diff parser, detection engine, integration)
bun run test:watch   # tests in watch mode
bun run lint         # Biome: no any, no unused imports, sorted imports
bun run lint:fix     # auto-fix lint issues
bun run format       # auto-format all source
```

## How it works

Two commands, two phases. `store` records what a merged PR did. `check` detects if a new PR breaks recently merged work.

### `store` command

Run after a PR merges. Records a "symbol footprint."

1. Runs `git diff main...HEAD` to get the unified diff between base and head
2. `diff.ts` parses the raw diff text into structured `DiffFile` objects — which files changed, which lines were added/deleted, with 1-based line numbers
3. Filters to `.ts`, `.tsx`, `.js`, `.jsx` files only, skipping `node_modules/`, `dist/`, `build/`, `.git/`, `vendor/`, `coverage/`
4. For each changed file:
   - Reads file content at the head ref via `git show HEAD:path/to/file`
   - Feeds source into web-tree-sitter (WASM parser) which produces a full AST
   - `parseFile()` walks the AST **once** and extracts both symbols and imports in a single pass, then frees the tree
   - For each symbol declaration whose line number falls within the diff's added lines → `symbols_added`
   - For each relative import on an added line → `symbols_referenced` (tracks what the PR now depends on)
5. Saves the footprint to `.git-regress/footprints.json`

### `check` command

Run on every new/updated PR. Detects regressions.

1. Runs `git diff main...HEAD` for the current branch
2. Same file filtering as `store`
3. For each changed file, determines deleted and modified symbols:
   - **Deleted file**: parses the base version, every symbol is considered deleted
   - **Added file**: skipped (can't delete existing symbols)
   - **Modified/renamed file**: parses both base and head versions, compares symbol sets
     - Symbol in base but not in head → deleted
     - Symbol in both but signature differs → modified
4. Loads stored footprints from the last N days (default 14, configurable via `--lookback`)
5. `detect.ts` cross-references: for each deleted/modified symbol, checks if any stored footprint's `symbols_added` or `symbols_referenced` contains it
6. Matching is by **name + file path + kind** — deleting `type Config` won't false-match `function Config`
7. If a PR both added and referenced the same symbol, only the "added" relationship is reported
8. Prints results to terminal. Posts a PR comment if GitHub credentials are provided.
9. Exits with code 1 if regressions found, code 0 if clean

### Symbol extraction

The tree-sitter AST walker in `ast.ts` extracts these from any TS/JS file:

| Pattern | Kind |
|---|---|
| `function foo()` | `function` |
| `const foo = () => {}` | `function` |
| `const foo = function() {}` | `function` |
| `type Foo = ...` | `type` |
| `interface Foo { ... }` | `interface` |
| `enum Foo { ... }` | `enum` |
| `class Foo { ... }` | `class` |
| `const FOO = ...` | `variable` |
| `export { foo, bar }` | `variable` |
| `export default MyComponent` | `variable` |
| `import { foo } from './bar'` | (import tracking) |

Only relative imports (starting with `./` or `../`) are tracked. External package imports are ignored.

For signature comparison (detecting modifications), the tool captures:
- Functions: parameter list text + return type text
- Types/interfaces/enums: the full body text

If the signature text changes between base and head, the symbol is flagged as modified.

### Import path resolution

Import paths are normalized for cross-reference matching:
- `../../lib/helpers.ts` → `src/lib/helpers`
- `./utils/index` → `src/utils`
- Extensions are stripped, `/index` suffixes are stripped, so `./utils` and `./utils/index.ts` resolve to the same canonical path.

### Storage

Footprints are stored in `.git-regress/footprints.json` at the repo root (gitignored). The file is a flat JSON object keyed by `pr_<number>`. Writes are atomic (write to `.tmp` then rename) to prevent corruption on interrupted writes.

### GitHub integration

When `--github-token`, `--owner`, `--repo`, and `--pr` are all provided, the tool posts a comment on the PR via Octokit. It uses an HTML comment tag (`<!-- git-regress -->`) to identify its own comments and updates them in-place instead of creating duplicates. Comment lookup is paginated so it works on PRs with 30+ comments. GitHub API failures are caught separately — they log a warning but don't fail the CI check.

### GitHub Action integration

The action is a single `dist/index.js` entry point. When `GITHUB_ACTIONS=true` (set by GitHub's runner), `index.ts` delegates to `action.ts` instead of the Commander.js CLI.

`action.ts` auto-detects the event type:

- **`push` to base branch**: extracts the merged PR number from the merge commit message, squash merge pattern, or the GitHub API. Runs `store`, prunes old footprints, and commits/pushes `footprints.json` with `[skip ci]`.
- **`pull_request`**: extracts the PR number from the event payload. Runs `check`, posts/updates/cleans up the PR comment.

Footprint persistence across CI runs uses **git-committed storage**: the `.git-regress/footprints.json` file is committed to the repo by the action on each merge. This is zero-cost (no external services), survives cache evictions, and travels with forks.

The commit uses `git-regress[bot]` as the author and includes `[skip ci]` to prevent infinite workflow triggers.

### Stale comment cleanup

When a PR previously had regressions but a new push resolves them, `postPRComment()` finds the existing git-regress comment and updates it to "All clear" instead of leaving a stale warning.

## Architecture

```
src/
├── index.ts              CLI entry + GitHub Action dispatch (delegates to action.ts when GITHUB_ACTIONS=true).
├── action.ts             GitHub Action orchestration. Auto-detects event, handles store/check/commit.
├── core.ts               Shared store/check logic used by both CLI and Action.
├── config.ts             File filtering (extensions + ignore paths) and language detection.
├── git.ts                Shell-safe git wrappers. Ref validation, POSIX arg escaping, repo root caching.
├── parser/
│   ├── ast.ts            Tree-sitter WASM integration. Lazy init, single-pass parse, tree cleanup.
│   │                     Also contains resolveImportPath for normalizing import paths.
│   └── diff.ts           Unified diff parser. Extracts files, hunks, line numbers from raw git diff output.
├── graph/
│   ├── footprint.ts      Types: SymbolRef, PRFootprint, FootprintStore.
│   ├── store.ts          JSON persistence. Atomic writes, ENOENT handling, lookback filtering, pruning.
│   └── detect.ts         Cross-reference engine. Matches deleted/modified symbols against stored footprints.
├── reporter/
│   ├── cli.ts            Terminal output formatting.
│   └── github.ts         PR comment posting via Octokit with pagination, upsert, and stale cleanup.
└── types/
    └── web-tree-sitter.d.ts   TypeScript declarations for the WASM tree-sitter CJS export.
```

## Build pipeline

`bun run build` does three things:

1. `tsc` compiles TypeScript to JavaScript in `dist/`
2. `ncc build dist/index.js -o dist` bundles everything (commander, octokit, web-tree-sitter JS runtime) into a single `dist/index.js` (~478KB)
3. Copies 3 WASM files into `dist/`: the tree-sitter runtime, TypeScript grammar, and TSX grammar

The `dist/` directory is fully self-contained. The GitHub Action (`action.yml`) points directly at `dist/index.js` using the `node20` runtime — GitHub runs it with zero installation steps. The bundle includes `@actions/core`, `@actions/github`, `commander`, `@octokit/rest`, and the `web-tree-sitter` JS runtime.

At runtime, `ast.ts` resolves WASM files by checking `__dirname` first (works when bundled in `dist/`), then falls back to `node_modules/` paths (works during development).

## Security

- Git refs validated against `/^[A-Za-z0-9_./:@^~{}-]+$/` before reaching `execSync`
- All shell arguments POSIX single-quote escaped via `run()` in `git.ts`
- `parseIntOrFail` rejects NaN and negative values for numeric CLI flags
- `getFileAtRef` re-throws unexpected git errors instead of swallowing them — only returns null for legitimately missing files
- Footprint store uses atomic writes (temp file + rename)
- GitHub API failures are isolated so they don't block CI

## Known limitations

See `edge-cases.md` for patterns that produce incorrect results or are not yet handled, including: re-exports, barrel files, declaration merging, function overloads, path aliases, namespace imports, and component props.

## Testing

Tests live alongside source files (`*.test.ts`). Current coverage:

- `src/parser/diff.test.ts` — diff parser: modified/added/deleted/renamed files, multi-file diffs, line number tracking
- `src/graph/detect.test.ts` — detection engine: deletions, modifications, name/file/kind matching, PR deduplication, multi-PR aggregation

Run with `bun run test`. Vitest is the test runner.
