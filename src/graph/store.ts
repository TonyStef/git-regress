import fs from 'fs';
import path from 'path';
import { getRepoRoot } from '../git';
import { canonicalizePath } from '../resolve';
import type { FootprintStore, PRFootprint, SymbolRef } from './footprint';

const STORE_DIR = '.git-regress';
const STORE_FILE = 'footprints.json';

function getStorePath(): string {
  return path.join(getRepoRoot(), STORE_DIR, STORE_FILE);
}

export function loadFootprints(): FootprintStore {
  const storePath = getStorePath();
  let raw: string;
  try {
    raw = fs.readFileSync(storePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw) as FootprintStore;
  } catch {
    throw new Error(
      `Corrupt footprint store at ${storePath}. Delete the file and re-run 'git-regress store' for each recent PR.`,
    );
  }
}

export function saveFootprints(store: FootprintStore): void {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });

  const tmp = `${storePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, storePath);
}

export function addFootprint(footprint: PRFootprint): void {
  const store = loadFootprints();
  store[`pr_${footprint.number}`] = footprint;
  saveFootprints(store);
}

function canonicalizeRefs(refs: SymbolRef[]): SymbolRef[] {
  return refs.map((r) => ({ ...r, file: canonicalizePath(r.file) }));
}

export function getRecentFootprints(lookbackDays: number): PRFootprint[] {
  const store = loadFootprints();
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  return Object.values(store)
    .filter((fp) => {
      const mergedAt = new Date(fp.merged_at).getTime();
      return mergedAt >= cutoff;
    })
    .map((fp) => ({
      ...fp,
      symbols_added: canonicalizeRefs(fp.symbols_added),
      symbols_referenced: canonicalizeRefs(fp.symbols_referenced),
    }));
}

/**
 * Remove footprints older than the lookback window.
 * Called during store to keep the JSON file small over time.
 */
export function pruneOldFootprints(lookbackDays: number): number {
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
