import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalizePath, createResolver } from './resolve';

describe('canonicalizePath', () => {
  it('strips .ts extension', () => {
    expect(canonicalizePath('src/helpers.ts')).toBe('src/helpers');
  });

  it('strips .tsx extension', () => {
    expect(canonicalizePath('src/App.tsx')).toBe('src/App');
  });

  it('strips .js extension', () => {
    expect(canonicalizePath('lib/utils.js')).toBe('lib/utils');
  });

  it('strips /index suffix', () => {
    expect(canonicalizePath('src/utils/index.ts')).toBe('src/utils');
  });

  it('strips /index without extension', () => {
    expect(canonicalizePath('src/utils/index')).toBe('src/utils');
  });

  it('normalizes backslashes', () => {
    expect(canonicalizePath('src\\components\\Button.ts')).toBe('src/components/Button');
  });

  it('strips leading ./', () => {
    expect(canonicalizePath('./src/helpers.ts')).toBe('src/helpers');
  });

  it('passes through paths without extension or index', () => {
    expect(canonicalizePath('src/helpers')).toBe('src/helpers');
  });
});

describe('createResolver — relative imports', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('resolves sibling import', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/components/App.tsx', './Button')).toBe('src/components/Button');
  });

  it('resolves parent traversal', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/deep/nested/file.ts', '../../lib/utils')).toBe('src/lib/utils');
  });

  it('strips extension from resolved path', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/a.ts', './b.ts')).toBe('src/b');
  });

  it('strips /index from resolved path', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/a.ts', './utils/index')).toBe('src/utils');
  });

  it('returns null for external packages', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/a.ts', 'lodash')).toBeNull();
    expect(resolver.resolve('src/a.ts', 'react')).toBeNull();
    expect(resolver.resolve('src/a.ts', 'node:fs')).toBeNull();
    expect(resolver.resolve('src/a.ts', '@types/node')).toBeNull();
  });
});

describe('createResolver — tsconfig path aliases', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-tsconfig-'));
    fs.writeFileSync(
      path.join(repoRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@components/*': ['src/components/*'],
          },
        },
      }),
    );
    fs.mkdirSync(path.join(repoRoot, 'src', 'components'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('resolves @/ alias to src/', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/app.ts', '@/lib/logger')).toBe('src/lib/logger');
  });

  it('resolves @components/ alias', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/app.ts', '@components/Button')).toBe('src/components/Button');
  });

  it('still resolves relative imports alongside aliases', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/app.ts', './utils')).toBe('src/utils');
  });

  it('returns null for unmatched non-relative imports', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/app.ts', 'lodash')).toBeNull();
  });
});

describe('createResolver — no tsconfig', () => {
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-noconfig-'));
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('resolves relative imports without tsconfig', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/a.ts', './b')).toBe('src/b');
  });

  it('returns null for aliased imports without tsconfig', () => {
    const resolver = createResolver(repoRoot);
    expect(resolver.resolve('src/a.ts', '@/lib/foo')).toBeNull();
  });
});
