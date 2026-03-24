import { createPathsMatcher, getTsconfig, type TsConfigResult } from 'get-tsconfig';
import path from 'path';

const EXTENSIONS_RE = /\.(ts|tsx|js|jsx)$/;

export interface ImportResolver {
  resolve(importerFile: string, importSource: string): string | null;
}

/**
 * Strip file extensions and /index suffixes for consistent symbol matching.
 * All SymbolRef.file values must go through this function.
 */
export function canonicalizePath(filePath: string): string {
  let result = filePath.replace(EXTENSIONS_RE, '');
  result = result.replace(/\/index$/, '');
  result = result.replace(/\\/g, '/');
  if (result.startsWith('./')) result = result.slice(2);
  return result;
}

interface CachedTsconfig {
  pathsMatcher: ((specifier: string) => string[]) | null;
  pathPatterns: string[];
}

function matchesPathPattern(importSource: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === importSource) return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (importSource.startsWith(`${prefix}/`)) return true;
    }
  }
  return false;
}

/**
 * Create an import resolver that handles relative paths and tsconfig path aliases.
 *
 * Resolution order:
 * 1. Relative imports (./  ../) — resolved from the importer's directory
 * 2. tsconfig paths — resolved via the nearest tsconfig.json's compilerOptions.paths
 * 3. No match — returns null (external package)
 */
export function createResolver(repoRoot: string, tsconfigPath?: string): ImportResolver {
  const tsconfigCache = new Map<string, CachedTsconfig | null>();

  function getTsconfigForDir(dir: string): CachedTsconfig | null {
    const cached = tsconfigCache.get(dir);
    if (cached !== undefined) return cached;

    let result: TsConfigResult | null;
    if (tsconfigPath) {
      // Explicit tsconfig — use for all files
      result = getTsconfig(tsconfigPath);
    } else {
      // Auto-detect: walk up from the file's directory
      result = getTsconfig(dir);
    }

    if (!result) {
      tsconfigCache.set(dir, null);
      return null;
    }

    const paths = result.config.compilerOptions?.paths;
    const entry: CachedTsconfig = {
      pathsMatcher: createPathsMatcher(result),
      pathPatterns: paths ? Object.keys(paths) : [],
    };
    tsconfigCache.set(dir, entry);
    return entry;
  }

  function resolve(importerFile: string, importSource: string): string | null {
    if (importSource.startsWith('./') || importSource.startsWith('../')) {
      const absImporter = path.resolve(repoRoot, importerFile);
      const resolved = path.resolve(path.dirname(absImporter), importSource);
      return canonicalizePath(path.relative(repoRoot, resolved));
    }

    const absImporter = path.resolve(repoRoot, importerFile);
    const tsconfig = getTsconfigForDir(path.dirname(absImporter));
    if (tsconfig?.pathsMatcher && matchesPathPattern(importSource, tsconfig.pathPatterns)) {
      const matches = tsconfig.pathsMatcher(importSource);
      if (matches.length > 0) {
        return canonicalizePath(path.relative(repoRoot, matches[0]));
      }
    }

    return null;
  }

  return { resolve };
}
