import { execSync } from 'child_process';

const SAFE_REF = /^[A-Za-z0-9_./:@^~{}-]+$/;

function assertSafeRef(ref: string): void {
  if (!SAFE_REF.test(ref)) {
    throw new Error(`Unsafe git ref: "${ref}"`);
  }
}

function run(args: string[]): string {
  const cmd = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  return execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }).trim();
}

export function getDiff(base: string, head: string): string {
  assertSafeRef(base);
  assertSafeRef(head);
  return run(['git', 'diff', `${base}...${head}`]);
}

export function getDiffTwoDot(base: string, head: string): string {
  assertSafeRef(base);
  assertSafeRef(head);
  return run(['git', 'diff', `${base}..${head}`]);
}

export function getFileAtRef(ref: string, filePath: string): string | null {
  assertSafeRef(ref);
  try {
    return run(['git', 'show', `${ref}:${filePath}`]);
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('does not exist') || msg.includes('exists on disk, but not in')) {
      return null;
    }
    throw err;
  }
}

export function getAuthorName(): string {
  try {
    return run(['git', 'config', 'user.name']);
  } catch {
    return 'unknown';
  }
}

export function getLastCommitMessage(): string {
  try {
    return run(['git', 'log', '-1', '--pretty=%s']);
  } catch {
    return '';
  }
}

let cachedRepoRoot: string | null = null;

export function getRepoRoot(): string {
  if (!cachedRepoRoot) {
    cachedRepoRoot = run(['git', 'rev-parse', '--show-toplevel']);
  }
  return cachedRepoRoot;
}
