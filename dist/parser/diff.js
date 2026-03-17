"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDiff = parseDiff;
exports.getAddedLineNumbers = getAddedLineNumbers;
function parseDiff(raw) {
    if (!raw.trim())
        return [];
    const chunks = raw.split(/^diff --git /m).filter(Boolean);
    const files = [];
    for (const chunk of chunks) {
        const file = parseFileChunk(chunk);
        if (file)
            files.push(file);
    }
    return files;
}
function parseFileChunk(chunk) {
    const lines = chunk.split('\n');
    let oldPath = null;
    let newPath = null;
    let status = 'modified';
    const hunks = [];
    const headerMatch = lines[0]?.match(/^a\/(.+?) b\/(.+)$/);
    if (headerMatch) {
        oldPath = headerMatch[1];
        newPath = headerMatch[2];
    }
    let i = 1;
    for (; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('--- ')) {
            const p = line.slice(4);
            oldPath = p === '/dev/null' ? null : p.replace(/^a\//, '');
        }
        else if (line.startsWith('+++ ')) {
            const p = line.slice(4);
            newPath = p === '/dev/null' ? null : p.replace(/^b\//, '');
        }
        else if (line.startsWith('new file')) {
            status = 'added';
        }
        else if (line.startsWith('deleted file')) {
            status = 'deleted';
        }
        else if (line.startsWith('rename from')) {
            status = 'renamed';
        }
        else if (line.startsWith('@@ ')) {
            break;
        }
    }
    if (oldPath === null && newPath !== null)
        status = 'added';
    if (oldPath !== null && newPath === null)
        status = 'deleted';
    let currentHunk = null;
    let oldLine = 0;
    let newLine = 0;
    for (; i < lines.length; i++) {
        const line = lines[i];
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
            if (currentHunk)
                hunks.push(currentHunk);
            oldLine = parseInt(hunkMatch[1], 10);
            newLine = parseInt(hunkMatch[3], 10);
            currentHunk = {
                oldStart: oldLine,
                oldLines: parseInt(hunkMatch[2] ?? '1', 10),
                newStart: newLine,
                newLines: parseInt(hunkMatch[4] ?? '1', 10),
                lines: [],
            };
            continue;
        }
        if (!currentHunk)
            continue;
        if (line.startsWith('+')) {
            currentHunk.lines.push({ type: 'add', content: line.slice(1), newLineNumber: newLine++ });
        }
        else if (line.startsWith('-')) {
            currentHunk.lines.push({ type: 'delete', content: line.slice(1), oldLineNumber: oldLine++ });
        }
        else if (line.startsWith('\\')) {
        }
        else {
            currentHunk.lines.push({
                type: 'context',
                content: line.startsWith(' ') ? line.slice(1) : line,
                oldLineNumber: oldLine++,
                newLineNumber: newLine++,
            });
        }
    }
    if (currentHunk)
        hunks.push(currentHunk);
    if (!oldPath && !newPath)
        return null;
    return { oldPath, newPath, status, hunks };
}
/** Returns 1-based line numbers that were added in the new file version. */
function getAddedLineNumbers(file) {
    const added = new Set();
    for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
            if (line.type === 'add' && line.newLineNumber !== undefined) {
                added.add(line.newLineNumber);
            }
        }
    }
    return added;
}
//# sourceMappingURL=diff.js.map