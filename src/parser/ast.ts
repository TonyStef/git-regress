import path from 'path';

import Parser = require('web-tree-sitter');

import type { SymbolKind } from '../graph/footprint';

type Node = Parser.SyntaxNode;

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number; // 1-based, matching diff line numbers
  exported: boolean;
  signature?: string;
}

export interface ExtractedImport {
  names: string[];
  source: string;
  line: number; // 1-based
}

export interface ParsedFile {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
}

let initialized = false;
let tsLang: Parser.Language | null = null;
let tsxLang: Parser.Language | null = null;
let parser: Parser | null = null;

function resolveWasm(filename: string): string {
  const fs = require('fs') as typeof import('fs');
  const bundledPath = path.join(__dirname, filename);
  if (fs.existsSync(bundledPath)) return bundledPath;

  if (filename === 'tree-sitter.wasm') {
    return path.join(path.dirname(require.resolve('web-tree-sitter')), filename);
  }
  return path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out', filename);
}

async function ensureInit(): Promise<void> {
  if (initialized) return;

  await Parser.init({
    locateFile: () => resolveWasm('tree-sitter.wasm'),
  });

  parser = new Parser();
  tsLang = await Parser.Language.load(resolveWasm('tree-sitter-typescript.wasm'));
  tsxLang = await Parser.Language.load(resolveWasm('tree-sitter-tsx.wasm'));
  initialized = true;
}

export async function parseFile(source: string, language: 'typescript' | 'tsx'): Promise<ParsedFile> {
  await ensureInit();
  parser!.setLanguage(language === 'tsx' ? tsxLang! : tsLang!);
  const tree = parser!.parse(source);
  if (!tree) return { symbols: [], imports: [] };

  try {
    const symbols: ExtractedSymbol[] = [];
    visitChildren(tree.rootNode, symbols, false);

    const imports: ExtractedImport[] = [];
    for (const child of tree.rootNode.namedChildren) {
      if (child.type === 'import_statement') {
        const imp = parseImportStatement(child);
        if (imp) imports.push(imp);
      }
      // Re-exports (export { x } from './bar') are import references
      if (child.type === 'export_statement') {
        const reExport = parseReExport(child);
        if (reExport) imports.push(reExport);
      }
    }

    // Resolve namespace import member accesses (import * as x from './y')
    const nsImports = collectNamespaceImports(tree.rootNode);
    if (nsImports.size > 0) {
      const memberImports = resolveNamespaceMembers(tree.rootNode, nsImports);
      imports.push(...memberImports);
    }

    return { symbols, imports };
  } finally {
    tree.delete();
  }
}

export async function extractSymbols(source: string, language: 'typescript' | 'tsx'): Promise<ExtractedSymbol[]> {
  const { symbols } = await parseFile(source, language);
  return symbols;
}

const EXTENSIONS_RE = /\.(ts|tsx|js|jsx)$/;

export function resolveImportPath(importerFile: string, importSource: string): string {
  const dir = path.dirname(importerFile);
  let resolved = path.normalize(path.join(dir, importSource));
  resolved = resolved.replace(EXTENSIONS_RE, '');
  resolved = resolved.replace(/\/index$/, '');
  return resolved;
}

function visitChildren(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  for (const child of node.namedChildren) {
    visitNode(child, symbols, exported);
  }
}

function visitNode(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  switch (node.type) {
    case 'export_statement':
      handleExportStatement(node, symbols);
      break;
    case 'function_declaration':
    case 'generator_function_declaration':
      handleFunctionDeclaration(node, symbols, exported);
      break;
    case 'lexical_declaration':
    case 'variable_declaration':
      handleVariableDeclaration(node, symbols, exported);
      break;
    case 'type_alias_declaration':
      handleTypeAlias(node, symbols, exported);
      break;
    case 'interface_declaration':
      handleInterface(node, symbols, exported);
      break;
    case 'enum_declaration':
      handleEnum(node, symbols, exported);
      break;
    case 'class_declaration':
      handleClass(node, symbols, exported);
      break;
  }
}

function handleExportStatement(node: Node, symbols: ExtractedSymbol[]): void {
  // Skip re-exports (export { x } from './bar') — handled as imports in parseFile
  const sourceNode = node.namedChildren.find((c) => c.type === 'string');
  if (sourceNode) {
    const source = sourceNode.text.replace(/['"]/g, '');
    if (source.startsWith('.')) return;
  }

  const exportClause = node.namedChildren.find((c) => c.type === 'export_clause');
  if (exportClause) {
    for (const spec of exportClause.namedChildren) {
      if (spec.type === 'export_specifier') {
        const nameNode = spec.childForFieldName('name');
        if (nameNode) {
          symbols.push({ name: nameNode.text, kind: 'variable', line: spec.startPosition.row + 1, exported: true });
        }
      }
    }
    return;
  }

  const hasDefault = node.children.some((c) => c.type === 'default');
  if (hasDefault) {
    const ident = node.namedChildren.find((c) => c.type === 'identifier');
    if (ident) {
      symbols.push({ name: ident.text, kind: 'variable', line: node.startPosition.row + 1, exported: true });
      return;
    }
  }

  for (const child of node.namedChildren) {
    visitNode(child, symbols, true);
  }
}

function handleFunctionDeclaration(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  const name = node.childForFieldName('name');
  if (!name) return;
  symbols.push({
    name: name.text,
    kind: 'function',
    line: node.startPosition.row + 1,
    exported,
    signature: buildFnSig(node),
  });
}

function handleVariableDeclaration(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  for (const declarator of node.namedChildren) {
    if (declarator.type !== 'variable_declarator') continue;
    const name = declarator.childForFieldName('name');
    const value = declarator.childForFieldName('value');
    if (!name || name.type !== 'identifier') continue;

    const isFn = value && ['arrow_function', 'function_expression', 'function'].includes(value.type);
    if (isFn && value) {
      symbols.push({
        name: name.text,
        kind: 'function',
        line: node.startPosition.row + 1,
        exported,
        signature: buildFnSig(value),
      });
    } else {
      const typeAnnotation = declarator.childForFieldName('type');
      symbols.push({
        name: name.text,
        kind: 'variable',
        line: node.startPosition.row + 1,
        exported,
        signature: typeAnnotation?.text,
      });
    }
  }
}

function handleTypeAlias(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  const name = node.childForFieldName('name');
  if (!name) return;
  const value = node.childForFieldName('value');
  symbols.push({ name: name.text, kind: 'type', line: node.startPosition.row + 1, exported, signature: value?.text });
}

function handleInterface(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  const name = node.childForFieldName('name');
  if (!name) return;
  const body = node.childForFieldName('body');
  symbols.push({
    name: name.text,
    kind: 'interface',
    line: node.startPosition.row + 1,
    exported,
    signature: body?.text,
  });
}

function handleEnum(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  const name = node.childForFieldName('name');
  if (!name) return;
  const body = node.childForFieldName('body');
  symbols.push({ name: name.text, kind: 'enum', line: node.startPosition.row + 1, exported, signature: body?.text });
}

function handleClass(node: Node, symbols: ExtractedSymbol[], exported: boolean): void {
  const name = node.childForFieldName('name');
  if (!name) return;
  symbols.push({ name: name.text, kind: 'class', line: node.startPosition.row + 1, exported });
}

function parseImportStatement(node: Node): ExtractedImport | null {
  const sourceNode = node.namedChildren.find((c) => c.type === 'string');
  if (!sourceNode) return null;
  const source = sourceNode.text.replace(/['"]/g, '');
  if (!source.startsWith('.')) return null;

  const names: string[] = [];
  for (const child of node.namedChildren) {
    if (child.type === 'import_clause') collectImportNames(child, names);
  }
  if (names.length === 0) return null;
  return { names, source, line: node.startPosition.row + 1 };
}

function collectImportNames(clause: Node, names: string[]): void {
  for (const child of clause.namedChildren) {
    switch (child.type) {
      case 'identifier':
        names.push(child.text);
        break;
      case 'named_imports':
        for (const spec of child.namedChildren) {
          if (spec.type === 'import_specifier') {
            const localName = spec.childForFieldName('name')?.text;
            if (localName) names.push(localName);
          }
        }
        break;
      // namespace_import (import * as x) is resolved via member expression
      // analysis in parseFile — skip here to avoid tracking the namespace
      // identifier as a symbol name
    }
  }
}

function parseReExport(node: Node): ExtractedImport | null {
  const sourceNode = node.namedChildren.find((c) => c.type === 'string');
  if (!sourceNode) return null;
  const source = sourceNode.text.replace(/['"]/g, '');
  if (!source.startsWith('.')) return null;

  const names: string[] = [];
  const exportClause = node.namedChildren.find((c) => c.type === 'export_clause');
  if (exportClause) {
    for (const spec of exportClause.namedChildren) {
      if (spec.type === 'export_specifier') {
        const nameNode = spec.childForFieldName('name');
        if (nameNode) names.push(nameNode.text);
      }
    }
  }
  // export * from './foo' — can't enumerate individual symbols without reading the source file
  if (names.length === 0) return null;
  return { names, source, line: node.startPosition.row + 1 };
}

function collectNamespaceImports(root: Node): Map<string, { source: string; line: number }> {
  const nsImports = new Map<string, { source: string; line: number }>();
  for (const child of root.namedChildren) {
    if (child.type !== 'import_statement') continue;
    const sourceNode = child.namedChildren.find((c) => c.type === 'string');
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/['"]/g, '');
    if (!source.startsWith('.')) continue;

    for (const clause of child.namedChildren) {
      if (clause.type !== 'import_clause') continue;
      for (const sub of clause.namedChildren) {
        if (sub.type === 'namespace_import') {
          const id = sub.namedChildren.find((c) => c.type === 'identifier');
          if (id) nsImports.set(id.text, { source, line: child.startPosition.row + 1 });
        }
      }
    }
  }
  return nsImports;
}

function resolveNamespaceMembers(
  root: Node,
  nsImports: Map<string, { source: string; line: number }>,
): ExtractedImport[] {
  const membersBySource = new Map<string, { names: Set<string>; line: number; source: string }>();
  walkMemberExpressions(root, nsImports, membersBySource);
  return Array.from(membersBySource.values()).map(({ names, source, line }) => ({
    names: Array.from(names),
    source,
    line,
  }));
}

function walkMemberExpressions(
  node: Node,
  nsImports: Map<string, { source: string; line: number }>,
  results: Map<string, { names: Set<string>; line: number; source: string }>,
): void {
  if (node.type === 'member_expression') {
    const object = node.childForFieldName('object');
    const property = node.childForFieldName('property');
    if (object?.type === 'identifier' && property) {
      const nsInfo = nsImports.get(object.text);
      if (nsInfo) {
        let entry = results.get(nsInfo.source);
        if (!entry) {
          entry = { names: new Set(), line: nsInfo.line, source: nsInfo.source };
          results.set(nsInfo.source, entry);
        }
        entry.names.add(property.text);
      }
    }
  }
  for (const child of node.namedChildren) {
    walkMemberExpressions(child, nsImports, results);
  }
}

function buildFnSig(node: Node): string {
  const params = node.childForFieldName('parameters');
  const returnType = node.childForFieldName('return_type');
  let sig = params?.text ?? '()';
  if (returnType) sig += returnType.text;
  return sig;
}
