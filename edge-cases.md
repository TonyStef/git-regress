# Edge Cases

Known patterns that may produce incorrect results or are not yet handled. Each entry describes the pattern, what git-regress currently does, and what the correct behavior should be.

## Not Handled

### Re-exports
```typescript
// src/utils/index.ts
export { formatDate } from './date';
export { parseInput } from './parse';
```
A PR that adds `formatDate` to `date.ts` won't have the re-export line in `index.ts` flagged as "added" unless that line was also added in the same diff. Consumers importing from `./utils` reference a different file path than `./utils/date`, so the symbol match fails.

### Barrel files
```typescript
// src/index.ts
export * from './components';
export * from './hooks';
```
`export *` re-exports everything but names no specific symbols. If PR A adds `useAuth` in `hooks.ts` and PR B deletes it, the barrel file import path (`./`) won't match the actual file path (`./hooks`). Wildcard re-exports are invisible to the current extractor.

### Declaration merging
```typescript
interface User { name: string; }
interface User { age: number; }
```
TypeScript merges these into one interface. git-regress extracts two separate `interface` symbols with the same name. If the second declaration is deleted, it's flagged as a full deletion even though `User` still exists via the first declaration.

### Function overloads
```typescript
function parse(input: string): number;
function parse(input: Buffer): number;
function parse(input: string | Buffer): number { ... }
```
Each overload signature appears as a separate `function_declaration` in the AST. Deleting one overload is flagged as deleting the entire function, which is misleading — the function still exists with fewer signatures.

### Ambient declarations
```typescript
declare module 'express' {
  interface Request { user?: User; }
}
declare global {
  interface Window { analytics: Analytics; }
}
```
These are module/global augmentations. The extractor treats them like regular interfaces. If PR A augments `Request` and PR B removes the augmentation, the regression warning references `Request` as if it were a local interface, which is confusing.

### Component props (React)
```typescript
const Button: FC<{ onClick: () => void; label: string }> = (props) => { ... };
function Modal({ isOpen, onClose }: ModalProps) { ... }
```
The `prop` kind exists in `SymbolKind` but nothing extracts individual props from React components. A prop added in one PR and removed in another is invisible.

### Default exports without a name
```typescript
export default function() { return 42; }
export default class { ... }
export default () => { ... }
```
Anonymous default exports have no name to track. The extractor skips them because `childForFieldName('name')` returns null.

### Computed property names
```typescript
const KEY = 'myMethod';
class Foo {
  [KEY]() { return true; }
}
```
The method name is a computed expression, not a static identifier. Tree-sitter represents this as a `computed_property_name` node. The extractor doesn't handle it.

### Type-only imports
```typescript
import type { Config } from './config';
```
Currently tracked the same as value imports. If PR A does `import type { Config }` and PR B deletes the `Config` type, the regression is correctly detected. But if PR A uses a value import and PR B changes `Config` from a type to a value (or vice versa), no regression is flagged even though the import may break.

### Renamed imports/exports
```typescript
import { foo as bar } from './utils';
export { internal as publicName } from './core';
```
For imports, the extractor tracks the local alias (`bar`), not the original name (`foo`). If PR B deletes `foo` from `utils.ts`, git-regress looks for a footprint referencing `bar` in `utils.ts` — which won't match because the stored symbol is `foo`. The name mismatch causes a missed detection.

### Namespace imports
```typescript
import * as utils from './helpers';
utils.formatDate();
```
The extractor tracks `utils` as a single referenced symbol. It doesn't know that `formatDate` is the actual dependency. Deleting `formatDate` from `helpers.ts` won't trigger a regression because the footprint only stores `utils`.

### Conditional exports
```typescript
let exp;
if (process.env.NODE_ENV === 'test') {
  exp = testImplementation;
} else {
  exp = prodImplementation;
}
export default exp;
```
Runtime-conditional exports can't be statically analyzed. The extractor sees `exp` as a variable, not the actual implementation being exported.

### String enum member changes
```typescript
enum Status { Active = 'ACTIVE', Inactive = 'INACTIVE' }
// changed to
enum Status { Active = 'active', Inactive = 'inactive' }
```
The enum name and member names stay the same, but the values changed. The signature comparison catches this (because the body text differs), but the regression message says "modifies `Status`" without specifying what changed inside.

### Cross-file type narrowing
```typescript
// PR A adds
export function isAdmin(user: User): user is AdminUser { ... }
// PR B changes User to remove the fields that AdminUser extends
```
The type predicate `user is AdminUser` depends on `AdminUser` being a subtype of `User`. Changing `User`'s shape breaks the predicate at runtime, but git-regress only tracks symbol existence and signatures, not type compatibility.

### Path aliases (tsconfig paths)
```typescript
import { logger } from '@/lib/logger';
import { db } from '~utils/database';
```
These use tsconfig `paths` or `baseUrl` and don't start with `./` or `../`. The extractor filters them out as external packages. Symbols imported via path aliases are invisible to the reference tracker.

## Partially Handled

### Multi-line declarations
```typescript
export function createUser(
  name: string,
  email: string,
  role: UserRole,
): Promise<User> {
```
The extractor uses the declaration's start line (the `function` keyword line) to match against diff added-line numbers. If only the parameter lines were added (e.g., adding a new param), the function line itself isn't in the added set, so the symbol isn't tracked as "added by this PR."

### Renamed files
```
rename from src/old-name.ts
rename to src/new-name.ts
```
The diff parser detects renames and uses the new path as canonical. But stored footprints from before the rename reference the old path. A symbol at `src/old-name.ts` in the footprint won't match `src/new-name.ts` in the check, causing missed detections.
