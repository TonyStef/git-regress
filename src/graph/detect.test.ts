import { describe, expect, it } from 'vitest';
import { detectRegressions } from './detect';
import type { PRFootprint, SymbolRef } from './footprint';

function makeFootprint(overrides: Partial<PRFootprint> = {}): PRFootprint {
  return {
    number: 350,
    merged_at: new Date().toISOString(),
    author: 'tony',
    title: 'Add new feature',
    symbols_added: [],
    symbols_referenced: [],
    ...overrides,
  };
}

function makeSymbol(overrides: Partial<SymbolRef> = {}): SymbolRef {
  return {
    name: 'myFunction',
    file: 'src/helpers.ts',
    kind: 'function',
    ...overrides,
  };
}

describe('detectRegressions', () => {
  it('detects a deletion that breaks a recently added symbol', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol({ name: 'identifyAgentTurns' })],
    });

    const deleted = [makeSymbol({ name: 'identifyAgentTurns' })];

    const regressions = detectRegressions(deleted, [], [footprint]);

    expect(regressions).toHaveLength(1);
    expect(regressions[0].type).toBe('deleted');
    expect(regressions[0].symbol.name).toBe('identifyAgentTurns');
    expect(regressions[0].affectedPRs).toHaveLength(1);
    expect(regressions[0].affectedPRs[0].relationship).toBe('added');
  });

  it('detects a deletion that breaks a referenced symbol', () => {
    const footprint = makeFootprint({
      symbols_referenced: [makeSymbol({ name: 'computeSegments' })],
    });

    const deleted = [makeSymbol({ name: 'computeSegments' })];

    const regressions = detectRegressions(deleted, [], [footprint]);

    expect(regressions).toHaveLength(1);
    expect(regressions[0].affectedPRs[0].relationship).toBe('referenced');
  });

  it('detects a modification that breaks a referenced symbol', () => {
    const footprint = makeFootprint({
      symbols_referenced: [makeSymbol({ name: 'formatDate' })],
    });

    const modified = [makeSymbol({ name: 'formatDate' })];

    const regressions = detectRegressions([], modified, [footprint]);

    expect(regressions).toHaveLength(1);
    expect(regressions[0].type).toBe('modified');
  });

  it('does not match symbols with different names', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol({ name: 'foo' })],
    });

    const deleted = [makeSymbol({ name: 'bar' })];

    const regressions = detectRegressions(deleted, [], [footprint]);
    expect(regressions).toHaveLength(0);
  });

  it('does not match symbols with same name but different files', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol({ name: 'helper', file: 'src/a.ts' })],
    });

    const deleted = [makeSymbol({ name: 'helper', file: 'src/b.ts' })];

    const regressions = detectRegressions(deleted, [], [footprint]);
    expect(regressions).toHaveLength(0);
  });

  it('does not match symbols_added with same name but different kind', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol({ name: 'Config', kind: 'type' })],
    });

    const deleted = [makeSymbol({ name: 'Config', kind: 'function' })];

    const regressions = detectRegressions(deleted, [], [footprint]);
    expect(regressions).toHaveLength(0);
  });

  it('ignores kind mismatch when matching symbols_referenced (bug #4)', () => {
    const footprint = makeFootprint({
      symbols_referenced: [makeSymbol({ name: 'formatDate', kind: 'variable' })],
    });

    // The actual deleted symbol is a function, but the reference was stored as 'variable'
    const deleted = [makeSymbol({ name: 'formatDate', kind: 'function' })];

    const regressions = detectRegressions(deleted, [], [footprint]);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].affectedPRs[0].relationship).toBe('referenced');
  });

  it('prefers added over referenced when a PR both adds and references', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol({ name: 'dual' })],
      symbols_referenced: [makeSymbol({ name: 'dual' })],
    });

    const deleted = [makeSymbol({ name: 'dual' })];

    const regressions = detectRegressions(deleted, [], [footprint]);

    expect(regressions).toHaveLength(1);
    // Should only appear once per PR, with 'added' taking priority
    expect(regressions[0].affectedPRs).toHaveLength(1);
    expect(regressions[0].affectedPRs[0].relationship).toBe('added');
  });

  it('returns empty array when no footprints exist', () => {
    const deleted = [makeSymbol({ name: 'orphan' })];
    expect(detectRegressions(deleted, [], [])).toEqual([]);
  });

  it('returns empty array when no symbols are deleted or modified', () => {
    const footprint = makeFootprint({
      symbols_added: [makeSymbol()],
    });
    expect(detectRegressions([], [], [footprint])).toEqual([]);
  });

  it('aggregates matches from multiple PRs', () => {
    const fp1 = makeFootprint({ number: 350, symbols_added: [makeSymbol({ name: 'shared' })] });
    const fp2 = makeFootprint({ number: 351, symbols_referenced: [makeSymbol({ name: 'shared' })] });

    const deleted = [makeSymbol({ name: 'shared' })];

    const regressions = detectRegressions(deleted, [], [fp1, fp2]);

    expect(regressions).toHaveLength(1);
    expect(regressions[0].affectedPRs).toHaveLength(2);
    expect(regressions[0].affectedPRs[0].pr.number).toBe(350);
    expect(regressions[0].affectedPRs[1].pr.number).toBe(351);
  });
});
