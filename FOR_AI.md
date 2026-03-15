# For AI Coding Agents

You are reading this because a project using git-regress flagged a potential semantic regression in your changes. This file explains what that means and what to do.

## What git-regress is

git-regress is a static analysis tool that tracks symbols (functions, types, interfaces, enums, classes, variables, exports) across pull requests using tree-sitter AST parsing. It detects when a PR deletes or modifies symbols that were recently introduced or depended on by other merged PRs.

Git's merge conflict detection only catches overlapping line changes. git-regress catches semantic conflicts — when code that was recently added by one PR is silently broken by another PR that touches different lines.

## What the warning means

A warning like this:

```
This PR deletes `identifyAgentTurns` (function in helpers.ts)
  -> Introduced by PR #350 (merged 3 days ago by @tony)
  -> Referenced by PR #351 (merged 2 days ago by @tony)
```

Means:

- Your changes remove the function `identifyAgentTurns` from `helpers.ts`
- PR #350 added that function 3 days ago
- PR #351 imported and uses that function
- If your changes merge, PR #350 and #351's functionality breaks silently

The tool matches symbols by name, file path, and kind (function/type/interface/etc). It also detects signature changes (modified parameter types, return types, or interface shapes).

## What to do

### If you're refactoring and the deletion is intentional

1. Find all callers of the deleted symbol. The warning tells you which PRs depend on it.
2. Update or replace the deleted symbol's functionality in those callers before merging.
3. Run `git-regress check --base main` to verify the warning is resolved.

### If you're refactoring and can rename instead of delete

Renames are tracked as delete + add. If you rename a function, the tool flags the old name as deleted. After renaming:

1. Update all import sites to use the new name.
2. The warning will clear once no stored footprint references the old name at the old file path.

### If the deletion is safe

Sometimes a symbol was added by a recent PR but is already unused or superseded. If you've verified this:

1. Confirm the symbol has no remaining callers in the codebase.
2. The warning is a false positive in this case — proceed with merging.

## How the tool works

1. After each PR merges, `git-regress store` records a footprint: which symbols were added and which existing symbols the new code imports.
2. On each new PR, `git-regress check` parses the diff, finds deleted/modified symbols, and cross-references them against footprints from the last 14 days.
3. Symbols are extracted via tree-sitter AST parsing from `.ts`, `.tsx`, `.js`, `.jsx` files.
4. Only relative imports (`./`, `../`) are tracked. External package imports are ignored.
5. Matching is by symbol name + file path + kind (a deleted `type Config` won't match a `function Config`).

## How to verify your fix

```bash
git-regress check --base main
```

If the output says "No semantic regressions detected", your changes are safe. If warnings remain, the listed symbols still have unresolved dependencies from recent PRs.

## Limitations

- Tracks TypeScript/JavaScript only (`.ts`, `.tsx`, `.js`, `.jsx`)
- Does not follow `export *` (barrel files) or path aliases (`@/lib/...`)
- Does not extract React component props
- Namespace imports (`import * as utils`) are tracked as a single symbol, not individual members
- Renamed imports track the local alias, not the original name
