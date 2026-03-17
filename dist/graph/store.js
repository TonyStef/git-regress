"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFootprints = loadFootprints;
exports.saveFootprints = saveFootprints;
exports.addFootprint = addFootprint;
exports.getRecentFootprints = getRecentFootprints;
exports.pruneOldFootprints = pruneOldFootprints;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const git_1 = require("../git");
const STORE_DIR = '.git-regress';
const STORE_FILE = 'footprints.json';
function getStorePath() {
    return path_1.default.join((0, git_1.getRepoRoot)(), STORE_DIR, STORE_FILE);
}
function loadFootprints() {
    const storePath = getStorePath();
    let raw;
    try {
        raw = fs_1.default.readFileSync(storePath, 'utf-8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return {};
        throw err;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Corrupt footprint store at ${storePath}. Delete the file and re-run 'git-regress store' for each recent PR.`);
    }
}
function saveFootprints(store) {
    const storePath = getStorePath();
    fs_1.default.mkdirSync(path_1.default.dirname(storePath), { recursive: true });
    const tmp = `${storePath}.tmp`;
    fs_1.default.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
    fs_1.default.renameSync(tmp, storePath);
}
function addFootprint(footprint) {
    const store = loadFootprints();
    store[`pr_${footprint.number}`] = footprint;
    saveFootprints(store);
}
function getRecentFootprints(lookbackDays) {
    const store = loadFootprints();
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    return Object.values(store).filter((fp) => {
        const mergedAt = new Date(fp.merged_at).getTime();
        return mergedAt >= cutoff;
    });
}
/**
 * Remove footprints older than the lookback window.
 * Called during store to keep the JSON file small over time.
 */
function pruneOldFootprints(lookbackDays) {
    const store = loadFootprints();
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const [key, fp] of Object.entries(store)) {
        const mergedAt = new Date(fp.merged_at).getTime();
        if (mergedAt < cutoff) {
            delete store[key];
            pruned++;
        }
    }
    if (pruned > 0) {
        saveFootprints(store);
    }
    return pruned;
}
//# sourceMappingURL=store.js.map