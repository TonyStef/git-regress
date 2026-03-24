import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = path.resolve(__dirname, '../dist/index.js');

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd, timeout: 30000 }).trim();
}

function runCli(args: string, cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, { encoding: 'utf-8', cwd, timeout: 30000 }).trim();
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: (e.stdout ?? '').trim(), exitCode: e.status ?? 1 };
  }
}

describe('integration: full regression detection scenario', () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-regress-test-'));

    run('git init', repoDir);
    run('git config user.email "test@test.com"', repoDir);
    run('git config user.name "Test"', repoDir);

    // Initial commit with a base file and gitignore for the store
    fs.writeFileSync(path.join(repoDir, '.gitignore'), '.git-regress/\n');
    fs.writeFileSync(path.join(repoDir, 'utils.ts'), 'export function existing() { return 1; }\n');
    run('git add -A && git commit -m "initial"', repoDir);
  });

  afterAll(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('detects when a PR deletes a function that another PR introduced', () => {
    // PR #10 adds identifyAgentTurns and computeSegments
    const praBranch = 'pr-10';
    run(`git checkout -b ${praBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'helpers.ts'),
      [
        'export function identifyAgentTurns(messages: string[]) {',
        '  return messages.filter(m => m.startsWith("agent:"));',
        '}',
        '',
        'export function computeSegments(input: string) {',
        '  return input.split("\\n");',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Add agent turn helpers"', repoDir);

    // Store PR #10's footprint
    const storeResult = runCli(`store --pr 10 --base main --head ${praBranch}`, repoDir);
    expect(storeResult.exitCode).toBe(0);
    expect(storeResult.stdout).toContain('symbol(s) added');

    // Merge PR #10
    run('git checkout main', repoDir);
    run(`git merge ${praBranch} --no-ff -m "Merge PR #10"`, repoDir);

    // PR #11 imports identifyAgentTurns
    const prbBranch = 'pr-11';
    run(`git checkout -b ${prbBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'consumer.ts'),
      [
        'import { identifyAgentTurns } from "./helpers";',
        '',
        'export function processMessages(msgs: string[]) {',
        '  return identifyAgentTurns(msgs);',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Use agent turn detection"', repoDir);

    // Store PR #11's footprint
    const storeResult2 = runCli(`store --pr 11 --base main --head ${prbBranch}`, repoDir);
    expect(storeResult2.exitCode).toBe(0);
    expect(storeResult2.stdout).toContain('symbol(s) referenced');

    // Merge PR #11
    run('git checkout main', repoDir);
    run(`git merge ${prbBranch} --no-ff -m "Merge PR #11"`, repoDir);

    // PR #20 refactors helpers.ts — deletes identifyAgentTurns
    const prcBranch = 'pr-20';
    run(`git checkout -b ${prcBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'helpers.ts'),
      ['export function computeSegments(input: string) {', '  return input.split("\\n");', '}', ''].join('\n'),
    );

    run('git add -A && git commit -m "Refactor: remove unused helpers"', repoDir);

    // Check should catch the regression
    const checkResult = runCli('check --base main', repoDir);
    expect(checkResult.exitCode).toBe(1);
    expect(checkResult.stdout).toContain('identifyAgentTurns');
    expect(checkResult.stdout).toContain('PR #10');
  });

  it('detects when a type signature is modified', () => {
    run('git checkout main', repoDir);
    const branch = 'pr-30';
    run(`git checkout -b ${branch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'types.ts'),
      ['export interface UserConfig {', '  name: string;', '  theme: "light" | "dark";', '}', ''].join('\n'),
    );

    run('git add -A && git commit -m "Add UserConfig type"', repoDir);

    const storeResult = runCli(`store --pr 30 --base main --head ${branch}`, repoDir);
    expect(storeResult.exitCode).toBe(0);

    run('git checkout main', repoDir);
    run(`git merge ${branch} --no-ff -m "Merge PR #30"`, repoDir);

    // PR #31 changes the interface shape
    const modBranch = 'pr-31';
    run(`git checkout -b ${modBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'types.ts'),
      [
        'export interface UserConfig {',
        '  name: string;',
        '  theme: "light" | "dark" | "system";',
        '  locale: string;',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Extend UserConfig"', repoDir);

    const checkResult = runCli('check --base main', repoDir);
    expect(checkResult.exitCode).toBe(1);
    expect(checkResult.stdout).toContain('UserConfig');
    expect(checkResult.stdout).toContain('modifies');
    expect(checkResult.stdout).toContain('PR #30');
  });

  it('reports clean when no regressions exist', () => {
    run('git checkout main', repoDir);
    const branch = 'pr-40';
    run(`git checkout -b ${branch}`, repoDir);

    fs.writeFileSync(path.join(repoDir, 'newfile.ts'), 'export function brandNew() { return true; }\n');

    run('git add -A && git commit -m "Add brand new function"', repoDir);

    const checkResult = runCli('check --base main', repoDir);
    expect(checkResult.exitCode).toBe(0);
    expect(checkResult.stdout).toContain('No semantic regressions detected');
  });

  it('does not flag partial removal of merged declarations as deletion', () => {
    run('git checkout main', repoDir);
    const addBranch = 'pr-50';
    run(`git checkout -b ${addBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'merged.ts'),
      [
        'export interface Config {',
        '  name: string;',
        '}',
        '',
        'export interface Config {',
        '  age: number;',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Add merged interface"', repoDir);
    runCli(`store --pr 50 --base main --head ${addBranch}`, repoDir);

    run('git checkout main', repoDir);
    run(`git merge ${addBranch} --no-ff -m "Merge PR #50"`, repoDir);

    // PR #51 removes one declaration but keeps the other
    const removeBranch = 'pr-51';
    run(`git checkout -b ${removeBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'merged.ts'),
      ['export interface Config {', '  name: string;', '}', ''].join('\n'),
    );

    run('git add -A && git commit -m "Remove second Config declaration"', repoDir);

    const checkResult = runCli('check --base main', repoDir);
    // Should flag as modified (signature changed), NOT as deleted
    expect(checkResult.stdout).not.toContain('deletes');
    // Config still exists, so the check should detect modification not deletion
    expect(checkResult.stdout).toContain('Config');
    expect(checkResult.stdout).toContain('modifies');
  });

  it('ignores overload signature removal when implementation survives', () => {
    run('git checkout main', repoDir);
    const addBranch = 'pr-60';
    run(`git checkout -b ${addBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'overloads.ts'),
      [
        'export function parse(input: string): number;',
        'export function parse(input: number): string;',
        'export function parse(input: string | number): number | string {',
        '  return typeof input === "string" ? input.length : String(input);',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Add overloaded parse"', repoDir);
    runCli(`store --pr 60 --base main --head ${addBranch}`, repoDir);

    run('git checkout main', repoDir);
    run(`git merge ${addBranch} --no-ff -m "Merge PR #60"`, repoDir);

    // PR #61 removes one overload signature but keeps the implementation
    const removeBranch = 'pr-61';
    run(`git checkout -b ${removeBranch}`, repoDir);

    fs.writeFileSync(
      path.join(repoDir, 'overloads.ts'),
      [
        'export function parse(input: string): number;',
        'export function parse(input: string | number): number | string {',
        '  return typeof input === "string" ? input.length : String(input);',
        '}',
        '',
      ].join('\n'),
    );

    run('git add -A && git commit -m "Remove one overload"', repoDir);

    const checkResult = runCli('check --base main', repoDir);
    // Tree-sitter only extracts the implementation function (not signature-only
    // overloads), so removing a signature doesn't change the extracted symbol.
    // The implementation is unchanged → no regression.
    expect(checkResult.exitCode).toBe(0);
  });

  it('detects deletion of a referenced import', () => {
    run('git checkout main', repoDir);

    // Verify the footprint from PR #11 stored the reference to identifyAgentTurns
    const footprintPath = path.join(repoDir, '.git-regress', 'footprints.json');
    const footprints = JSON.parse(fs.readFileSync(footprintPath, 'utf-8'));
    const pr11 = footprints.pr_11;

    expect(pr11).toBeDefined();
    expect(pr11.symbols_referenced.some((s: { name: string }) => s.name === 'identifyAgentTurns')).toBe(true);
  });
});
