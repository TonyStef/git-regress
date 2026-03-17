"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiff = getDiff;
exports.getDiffTwoDot = getDiffTwoDot;
exports.getFileAtRef = getFileAtRef;
exports.getAuthorName = getAuthorName;
exports.getLastCommitMessage = getLastCommitMessage;
exports.getRepoRoot = getRepoRoot;
const child_process_1 = require("child_process");
const SAFE_REF = /^[A-Za-z0-9_./:@^~{}-]+$/;
function assertSafeRef(ref) {
    if (!SAFE_REF.test(ref)) {
        throw new Error(`Unsafe git ref: "${ref}"`);
    }
}
function run(args) {
    const cmd = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    return (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim();
}
function getDiff(base, head) {
    assertSafeRef(base);
    assertSafeRef(head);
    return run(['git', 'diff', `${base}...${head}`]);
}
function getDiffTwoDot(base, head) {
    assertSafeRef(base);
    assertSafeRef(head);
    return run(['git', 'diff', `${base}..${head}`]);
}
function getFileAtRef(ref, filePath) {
    assertSafeRef(ref);
    try {
        return run(['git', 'show', `${ref}:${filePath}`]);
    }
    catch (err) {
        const msg = err.message ?? '';
        if (msg.includes('does not exist') || msg.includes('exists on disk, but not in')) {
            return null;
        }
        throw err;
    }
}
function getAuthorName() {
    try {
        return run(['git', 'config', 'user.name']);
    }
    catch {
        return 'unknown';
    }
}
function getLastCommitMessage() {
    try {
        return run(['git', 'log', '-1', '--pretty=%s']);
    }
    catch {
        return '';
    }
}
let cachedRepoRoot = null;
function getRepoRoot() {
    if (!cachedRepoRoot) {
        cachedRepoRoot = run(['git', 'rev-parse', '--show-toplevel']);
    }
    return cachedRepoRoot;
}
//# sourceMappingURL=git.js.map