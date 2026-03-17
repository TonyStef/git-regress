import type { SymbolKind } from '../graph/footprint';
export interface ExtractedSymbol {
    name: string;
    kind: SymbolKind;
    line: number;
    exported: boolean;
    signature?: string;
}
export interface ExtractedImport {
    names: string[];
    source: string;
    line: number;
}
export interface ParsedFile {
    symbols: ExtractedSymbol[];
    imports: ExtractedImport[];
}
export declare function parseFile(source: string, language: 'typescript' | 'tsx'): Promise<ParsedFile>;
export declare function extractSymbols(source: string, language: 'typescript' | 'tsx'): Promise<ExtractedSymbol[]>;
export declare function resolveImportPath(importerFile: string, importSource: string): string;
