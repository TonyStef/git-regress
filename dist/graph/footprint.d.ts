export type SymbolKind = 'function' | 'type' | 'interface' | 'enum' | 'class' | 'variable' | 'prop';
export interface SymbolRef {
    name: string;
    file: string;
    kind: SymbolKind;
}
export interface PRFootprint {
    number: number;
    merged_at: string;
    author: string;
    title: string;
    branch?: string;
    symbols_added: SymbolRef[];
    symbols_referenced: SymbolRef[];
}
export interface FootprintStore {
    [key: string]: PRFootprint;
}
