import { describe, expect, it } from 'vitest';
import { getAddedLineNumbers, parseDiff } from './diff';

const MODIFIED_DIFF = `diff --git a/src/helpers.ts b/src/helpers.ts
index abc1234..def5678 100644
--- a/src/helpers.ts
+++ b/src/helpers.ts
@@ -10,6 +10,8 @@ function existing() {
   return true;
 }

+export function newHelper() {
+  return 42;
+}
+
 function another() {`;

const NEW_FILE_DIFF = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return 'world';
+}`;

const DELETED_FILE_DIFF = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function goodbye() {
-  return 'farewell';
-}`;

const RENAMED_DIFF = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 90%
rename from src/old-name.ts
rename to src/new-name.ts
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export function oldName() {
+export function newName() {
   return true;
 }`;

const MULTI_FILE_DIFF = `${MODIFIED_DIFF}
${NEW_FILE_DIFF}`;

describe('parseDiff', () => {
  it('parses a modified file diff', () => {
    const files = parseDiff(MODIFIED_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('src/helpers.ts');
    expect(files[0].newPath).toBe('src/helpers.ts');
    expect(files[0].status).toBe('modified');
    expect(files[0].hunks).toHaveLength(1);
  });

  it('parses a new file diff', () => {
    const files = parseDiff(NEW_FILE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBeNull();
    expect(files[0].newPath).toBe('src/new-file.ts');
    expect(files[0].status).toBe('added');
  });

  it('parses a deleted file diff', () => {
    const files = parseDiff(DELETED_FILE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].oldPath).toBe('src/old-file.ts');
    expect(files[0].newPath).toBeNull();
    expect(files[0].status).toBe('deleted');
  });

  it('parses a renamed file diff', () => {
    const files = parseDiff(RENAMED_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('renamed');
    expect(files[0].oldPath).toBe('src/old-name.ts');
    expect(files[0].newPath).toBe('src/new-name.ts');
  });

  it('parses multiple files in one diff', () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    expect(files).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(parseDiff('')).toEqual([]);
    expect(parseDiff('   ')).toEqual([]);
  });

  it('tracks correct 1-based line numbers for additions', () => {
    const files = parseDiff(MODIFIED_DIFF);
    const added = getAddedLineNumbers(files[0]);
    // Hunk starts at new line 13, and we have 4 added lines
    expect(added.has(13)).toBe(true);
    expect(added.has(14)).toBe(true);
    expect(added.has(15)).toBe(true);
    expect(added.has(16)).toBe(true);
    expect(added.has(12)).toBe(false);
  });
});
