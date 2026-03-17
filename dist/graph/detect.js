"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRegressions = detectRegressions;
function detectRegressions(deletedSymbols, modifiedSymbols, footprints) {
    const regressions = [];
    for (const symbol of deletedSymbols) {
        const matches = findAffectedPRs(symbol, footprints);
        if (matches.length > 0) {
            regressions.push({ symbol, type: 'deleted', affectedPRs: matches });
        }
    }
    for (const symbol of modifiedSymbols) {
        const matches = findAffectedPRs(symbol, footprints);
        if (matches.length > 0) {
            regressions.push({ symbol, type: 'modified', affectedPRs: matches });
        }
    }
    return regressions;
}
function symbolMatches(stored, target) {
    return stored.name === target.name && stored.file === target.file && stored.kind === target.kind;
}
function findAffectedPRs(symbol, footprints) {
    const matches = [];
    for (const fp of footprints) {
        const wasAdded = fp.symbols_added.some((s) => symbolMatches(s, symbol));
        if (wasAdded) {
            matches.push({ pr: fp, relationship: 'added' });
            continue;
        }
        const wasReferenced = fp.symbols_referenced.some((s) => symbolMatches(s, symbol));
        if (wasReferenced) {
            matches.push({ pr: fp, relationship: 'referenced' });
        }
    }
    return matches;
}
//# sourceMappingURL=detect.js.map