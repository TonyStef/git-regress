"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStore = runStore;
exports.runCheck = runCheck;
const config_1 = require("./config");
const git_1 = require("./git");
const detect_1 = require("./graph/detect");
const store_1 = require("./graph/store");
const ast_1 = require("./parser/ast");
const diff_1 = require("./parser/diff");
function filterSupported(files) {
    const config = (0, config_1.loadConfig)();
    return files.filter((f) => {
        const p = f.newPath ?? f.oldPath;
        return p && (0, config_1.isSupportedFile)(p, config);
    });
}
function toRef(sym, file) {
    return { name: sym.name, file, kind: sym.kind };
}
/**
 * Store a symbol footprint for a merged PR.
 * Shared by CLI and GitHub Action entry points.
 */
async function runStore(opts) {
    const base = opts.base;
    const head = opts.head;
    const author = opts.author || (0, git_1.getAuthorName)();
    const title = opts.title || (0, git_1.getLastCommitMessage)();
    const mergedAt = opts.mergedAt || new Date().toISOString();
    const raw = opts.twoDot ? (0, git_1.getDiffTwoDot)(base, head) : (0, git_1.getDiff)(base, head);
    const supported = filterSupported((0, diff_1.parseDiff)(raw));
    const symbolsAdded = [];
    const symbolsReferenced = [];
    for (const file of supported) {
        const filePath = file.newPath;
        const source = (0, git_1.getFileAtRef)(head, filePath);
        if (!source)
            continue;
        const lang = (0, config_1.getLanguage)(filePath);
        const addedLines = (0, diff_1.getAddedLineNumbers)(file);
        const { symbols, imports } = await (0, ast_1.parseFile)(source, lang);
        for (const sym of symbols) {
            if (addedLines.has(sym.line)) {
                symbolsAdded.push(toRef(sym, filePath));
            }
        }
        for (const imp of imports) {
            if (addedLines.has(imp.line)) {
                const resolvedFile = (0, ast_1.resolveImportPath)(filePath, imp.source);
                for (const name of imp.names) {
                    symbolsReferenced.push({ name, file: resolvedFile, kind: 'variable' });
                }
            }
        }
    }
    const footprint = {
        number: opts.pr,
        merged_at: mergedAt,
        author,
        title,
        symbols_added: symbolsAdded,
        symbols_referenced: symbolsReferenced,
    };
    (0, store_1.addFootprint)(footprint);
    return {
        symbolsAdded: symbolsAdded.length,
        symbolsReferenced: symbolsReferenced.length,
        footprint,
    };
}
/**
 * Check current branch for semantic regressions against recently merged PRs.
 * Shared by CLI and GitHub Action entry points.
 */
async function runCheck(opts) {
    const raw = (0, git_1.getDiff)(opts.base, 'HEAD');
    const supported = filterSupported((0, diff_1.parseDiff)(raw));
    const deletedSymbols = [];
    const modifiedSymbols = [];
    for (const file of supported) {
        const filePath = file.oldPath ?? file.newPath;
        if (file.status === 'deleted') {
            const oldSource = (0, git_1.getFileAtRef)(opts.base, filePath);
            if (!oldSource)
                continue;
            const oldSymbols = await (0, ast_1.extractSymbols)(oldSource, (0, config_1.getLanguage)(filePath));
            for (const sym of oldSymbols) {
                deletedSymbols.push(toRef(sym, filePath));
            }
            continue;
        }
        if (file.status === 'added')
            continue;
        const oldSource = (0, git_1.getFileAtRef)(opts.base, file.oldPath);
        const newSource = (0, git_1.getFileAtRef)('HEAD', file.newPath);
        if (!oldSource || !newSource)
            continue;
        const lang = (0, config_1.getLanguage)(file.newPath);
        const oldSymbols = await (0, ast_1.extractSymbols)(oldSource, lang);
        const newSymbols = await (0, ast_1.extractSymbols)(newSource, lang);
        const newSymbolMap = new Map();
        for (const sym of newSymbols) {
            newSymbolMap.set(`${sym.name}:${sym.kind}`, sym);
        }
        for (const oldSym of oldSymbols) {
            const key = `${oldSym.name}:${oldSym.kind}`;
            const newSym = newSymbolMap.get(key);
            const canonicalPath = file.newPath ?? file.oldPath;
            if (!newSym) {
                deletedSymbols.push(toRef(oldSym, canonicalPath));
            }
            else if (oldSym.signature && newSym.signature && oldSym.signature !== newSym.signature) {
                modifiedSymbols.push(toRef(oldSym, canonicalPath));
            }
        }
    }
    const footprints = (0, store_1.getRecentFootprints)(opts.lookbackDays);
    const regressions = (0, detect_1.detectRegressions)(deletedSymbols, modifiedSymbols, footprints);
    return {
        regressions,
        deletedCount: deletedSymbols.length,
        modifiedCount: modifiedSymbols.length,
    };
}
//# sourceMappingURL=core.js.map