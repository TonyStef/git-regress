import { describe, expect, it } from 'vitest';
import { parseFile } from './ast';

describe('parseFile — import extraction', () => {
  it('tracks original name for renamed imports, not the alias (bug #3)', async () => {
    const source = `import { foo as bar } from './utils';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['foo']);
    expect(imports[0].source).toBe('./utils');
  });

  it('tracks original name when multiple renamed imports exist', async () => {
    const source = `import { foo as f, bar as b, baz } from './helpers';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toContain('foo');
    expect(imports[0].names).toContain('bar');
    expect(imports[0].names).toContain('baz');
    expect(imports[0].names).not.toContain('f');
    expect(imports[0].names).not.toContain('b');
  });

  it('resolves namespace import member accesses (bug #5)', async () => {
    const source = [
      'import * as utils from "./helpers";',
      '',
      'function main() {',
      '  const a = utils.formatDate();',
      '  const b = utils.parseInput("x");',
      '}',
    ].join('\n');

    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe('./helpers');
    expect(imports[0].names).toContain('formatDate');
    expect(imports[0].names).toContain('parseInput');
    expect(imports[0].names).not.toContain('utils');
  });

  it('does not track namespace identifier when no member accesses exist', async () => {
    const source = `import * as utils from './helpers';`;
    const { imports } = await parseFile(source, 'typescript');

    // No member accesses found, no names to resolve — import should be empty
    expect(imports).toHaveLength(0);
  });

  it('handles mixed default + namespace import', async () => {
    const source = ['import defaultExport, * as ns from "./module";', 'ns.doStuff();'].join('\n');

    const { imports } = await parseFile(source, 'typescript');

    const allNames = imports.flatMap((i) => i.names);
    expect(allNames).toContain('defaultExport');
    expect(allNames).toContain('doStuff');
    expect(allNames).not.toContain('ns');
  });
});

describe('parseFile — non-relative imports', () => {
  it('extracts path alias imports', async () => {
    const source = `import { useAuth } from '@/context/AuthContext';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['useAuth']);
    expect(imports[0].source).toBe('@/context/AuthContext');
  });

  it('extracts scoped package imports', async () => {
    const source = `import type { ChatParams } from '@company/protocol';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['ChatParams']);
  });

  it('extracts bare package imports', async () => {
    const source = `import { useState } from 'react';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['useState']);
    expect(imports[0].source).toBe('react');
  });

  it('extracts non-relative namespace import member accesses', async () => {
    const source = ['import * as helpers from "@/utils/helpers";', 'helpers.formatDate();'].join('\n');
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toContain('formatDate');
    expect(imports[0].source).toBe('@/utils/helpers');
  });

  it('extracts non-relative re-exports as imports, not symbols', async () => {
    const source = `export { foo } from '@/utils';`;
    const { imports, symbols } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['foo']);
    expect(symbols.map((s) => s.name)).not.toContain('foo');
  });
});

describe('parseFile — re-export extraction', () => {
  it('extracts named re-exports as import references (bug #6)', async () => {
    const source = `export { formatDate } from './date';`;
    const { imports, symbols } = await parseFile(source, 'typescript');

    // Should appear as an import reference, not a symbol
    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['formatDate']);
    expect(imports[0].source).toBe('./date');

    // Should NOT be in symbols (it's not a local definition)
    const symbolNames = symbols.map((s) => s.name);
    expect(symbolNames).not.toContain('formatDate');
  });

  it('extracts multiple named re-exports', async () => {
    const source = `export { foo, bar, baz } from './utils';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['foo', 'bar', 'baz']);
  });

  it('uses original name for aliased re-exports (bug #6)', async () => {
    const source = `export { internal as publicName } from './core';`;
    const { imports } = await parseFile(source, 'typescript');

    expect(imports).toHaveLength(1);
    expect(imports[0].names).toEqual(['internal']);
    expect(imports[0].names).not.toContain('publicName');
  });

  it('does not extract export * (wildcard re-exports are unresolvable)', async () => {
    const source = `export * from './foo';`;
    const { imports } = await parseFile(source, 'typescript');

    // Can't enumerate individual symbols without reading the source file
    expect(imports).toHaveLength(0);
  });

  it('still extracts local export clauses as symbols', async () => {
    const source = ['const x = 1;', 'const y = 2;', 'export { x, y };'].join('\n');

    const { symbols } = await parseFile(source, 'typescript');

    const exported = symbols.filter((s) => s.exported);
    const exportedNames = exported.map((s) => s.name);
    expect(exportedNames).toContain('x');
    expect(exportedNames).toContain('y');
  });
});
