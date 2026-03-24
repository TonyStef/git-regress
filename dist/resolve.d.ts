export interface ImportResolver {
    resolve(importerFile: string, importSource: string): string | null;
}
/**
 * Strip file extensions and /index suffixes for consistent symbol matching.
 * All SymbolRef.file values must go through this function.
 */
export declare function canonicalizePath(filePath: string): string;
/**
 * Create an import resolver that handles relative paths and tsconfig path aliases.
 *
 * Resolution order:
 * 1. Relative imports (./  ../) — resolved from the importer's directory
 * 2. tsconfig paths — resolved via the nearest tsconfig.json's compilerOptions.paths
 * 3. No match — returns null (external package)
 */
export declare function createResolver(repoRoot: string, tsconfigPath?: string): ImportResolver;
