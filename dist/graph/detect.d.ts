import type { PRFootprint, SymbolRef } from './footprint';
export interface RegressionMatch {
    pr: PRFootprint;
    relationship: 'added' | 'referenced';
}
export interface Regression {
    symbol: SymbolRef;
    type: 'deleted' | 'modified';
    affectedPRs: RegressionMatch[];
}
export declare function detectRegressions(deletedSymbols: SymbolRef[], modifiedSymbols: SymbolRef[], footprints: PRFootprint[]): Regression[];
