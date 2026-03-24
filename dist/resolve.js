"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizePath = canonicalizePath;
exports.createResolver = createResolver;
const get_tsconfig_1 = require("get-tsconfig");
const path_1 = __importDefault(require("path"));
const EXTENSIONS_RE = /\.(ts|tsx|js|jsx)$/;
/**
 * Strip file extensions and /index suffixes for consistent symbol matching.
 * All SymbolRef.file values must go through this function.
 */
function canonicalizePath(filePath) {
    let result = filePath.replace(EXTENSIONS_RE, '');
    result = result.replace(/\/index$/, '');
    result = result.replace(/\\/g, '/');
    if (result.startsWith('./'))
        result = result.slice(2);
    return result;
}
function matchesPathPattern(importSource, patterns) {
    for (const pattern of patterns) {
        if (pattern === importSource)
            return true;
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2);
            if (importSource.startsWith(`${prefix}/`))
                return true;
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
function createResolver(repoRoot, tsconfigPath) {
    const tsconfigCache = new Map();
    function getTsconfigForDir(dir) {
        const cached = tsconfigCache.get(dir);
        if (cached !== undefined)
            return cached;
        let result;
        if (tsconfigPath) {
            // Explicit tsconfig — use for all files
            result = (0, get_tsconfig_1.getTsconfig)(tsconfigPath);
        }
        else {
            // Auto-detect: walk up from the file's directory
            result = (0, get_tsconfig_1.getTsconfig)(dir);
        }
        if (!result) {
            tsconfigCache.set(dir, null);
            return null;
        }
        const paths = result.config.compilerOptions?.paths;
        const entry = {
            pathsMatcher: (0, get_tsconfig_1.createPathsMatcher)(result),
            pathPatterns: paths ? Object.keys(paths) : [],
        };
        tsconfigCache.set(dir, entry);
        return entry;
    }
    function resolve(importerFile, importSource) {
        if (importSource.startsWith('./') || importSource.startsWith('../')) {
            const absImporter = path_1.default.resolve(repoRoot, importerFile);
            const resolved = path_1.default.resolve(path_1.default.dirname(absImporter), importSource);
            return canonicalizePath(path_1.default.relative(repoRoot, resolved));
        }
        const absImporter = path_1.default.resolve(repoRoot, importerFile);
        const tsconfig = getTsconfigForDir(path_1.default.dirname(absImporter));
        if (tsconfig?.pathsMatcher && matchesPathPattern(importSource, tsconfig.pathPatterns)) {
            const matches = tsconfig.pathsMatcher(importSource);
            if (matches.length > 0) {
                return canonicalizePath(path_1.default.relative(repoRoot, matches[0]));
            }
        }
        return null;
    }
    return { resolve };
}
//# sourceMappingURL=resolve.js.map