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
const resolve_1 = require("./resolve");
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
function groupByKey(symbols) {
    const groups = new Map();
    for (const sym of symbols) {
        const key = `${sym.name}:${sym.kind}`;
        const group = groups.get(key);
        if (group)
            group.push(sym);
        else
            groups.set(key, [sym]);
    }
    return groups;
}
function hasSignatureChange(oldGroup, newGroup) {
    const oldSigs = oldGroup
        .map((s) => s.signature)
        .filter(Boolean)
        .sort();
    const newSigs = newGroup
        .map((s) => s.signature)
        .filter(Boolean)
        .sort();
    if (oldSigs.length === 0 || newSigs.length === 0)
        return false;
    if (oldSigs.length !== newSigs.length)
        return true;
    return oldSigs.some((sig, i) => sig !== newSigs[i]);
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
    const resolver = (0, resolve_1.createResolver)((0, git_1.getRepoRoot)(), opts.tsconfigPath);
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
                symbolsAdded.push(toRef(sym, (0, resolve_1.canonicalizePath)(filePath)));
            }
        }
        for (const imp of imports) {
            if (addedLines.has(imp.line)) {
                const resolvedFile = resolver.resolve(filePath, imp.source);
                if (!resolvedFile)
                    continue;
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
            const canonical = (0, resolve_1.canonicalizePath)(filePath);
            for (const [, group] of groupByKey(oldSymbols)) {
                deletedSymbols.push(toRef(group[0], canonical));
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
        const canonical = (0, resolve_1.canonicalizePath)(file.newPath ?? file.oldPath);
        const oldGroups = groupByKey(oldSymbols);
        const newGroups = groupByKey(newSymbols);
        for (const [key, oldGroup] of oldGroups) {
            const newGroup = newGroups.get(key);
            if (!newGroup) {
                deletedSymbols.push(toRef(oldGroup[0], canonical));
            }
            else if (hasSignatureChange(oldGroup, newGroup)) {
                modifiedSymbols.push(toRef(oldGroup[0], canonical));
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