export interface DiffFile {
    oldPath: string | null;
    newPath: string | null;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    hunks: DiffHunk[];
}
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLine[];
}
export interface DiffLine {
    type: 'add' | 'delete' | 'context';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
}
export declare function parseDiff(raw: string): DiffFile[];
/** Returns 1-based line numbers that were added in the new file version. */
export declare function getAddedLineNumbers(file: DiffFile): Set<number>;
