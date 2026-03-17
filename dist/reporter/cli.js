"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRegressions = formatRegressions;
const path_1 = __importDefault(require("path"));
function formatRegressions(regressions) {
    if (regressions.length === 0) {
        return 'No semantic regressions detected.';
    }
    const lines = ['Warning: Potential semantic regression detected\n'];
    for (const reg of regressions) {
        const verb = reg.type === 'deleted' ? 'deletes' : 'modifies';
        const fileName = path_1.default.basename(reg.symbol.file);
        lines.push(`This PR ${verb} \`${reg.symbol.name}\` (${reg.symbol.kind} in ${fileName})`);
        for (const match of reg.affectedPRs) {
            const rel = match.relationship === 'added' ? 'Introduced' : 'Referenced';
            const ago = timeAgo(match.pr.merged_at);
            lines.push(`  -> ${rel} by PR #${match.pr.number} (merged ${ago} by @${match.pr.author}) -- ${match.pr.title}`);
        }
        lines.push('');
    }
    lines.push('This may silently break functionality from those PRs. Please verify.');
    return lines.join('\n');
}
function timeAgo(isoDate) {
    const diff = Date.now() - new Date(isoDate).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0)
        return 'recently';
    if (days === 0)
        return 'today';
    if (days === 1)
        return '1 day ago';
    return `${days} days ago`;
}
//# sourceMappingURL=cli.js.map