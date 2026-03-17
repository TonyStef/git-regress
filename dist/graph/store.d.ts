import type { FootprintStore, PRFootprint } from './footprint';
export declare function loadFootprints(): FootprintStore;
export declare function saveFootprints(store: FootprintStore): void;
export declare function addFootprint(footprint: PRFootprint): void;
export declare function getRecentFootprints(lookbackDays: number): PRFootprint[];
/**
 * Remove footprints older than the lookback window.
 * Called during store to keep the JSON file small over time.
 */
export declare function pruneOldFootprints(lookbackDays: number): number;
