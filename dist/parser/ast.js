"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFile = parseFile;
exports.extractSymbols = extractSymbols;
exports.resolveImportPath = resolveImportPath;
const path_1 = __importDefault(require("path"));
const Parser = require("web-tree-sitter");
let initialized = false;
let tsLang = null;
let tsxLang = null;
let parser = null;
function resolveWasm(filename) {
    const fs = require('fs');
    const bundledPath = path_1.default.join(__dirname, filename);
    if (fs.existsSync(bundledPath))
        return bundledPath;
    if (filename === 'tree-sitter.wasm') {
        return path_1.default.join(path_1.default.dirname(require.resolve('web-tree-sitter')), filename);
    }
    return path_1.default.join(path_1.default.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out', filename);
}
async function ensureInit() {
    if (initialized)
        return;
    await Parser.init({
        locateFile: () => resolveWasm('tree-sitter.wasm'),
    });
    parser = new Parser();
    tsLang = await Parser.Language.load(resolveWasm('tree-sitter-typescript.wasm'));
    tsxLang = await Parser.Language.load(resolveWasm('tree-sitter-tsx.wasm'));
    initialized = true;
}
async function parseFile(source, language) {
    await ensureInit();
    parser.setLanguage(language === 'tsx' ? tsxLang : tsLang);
    const tree = parser.parse(source);
    if (!tree)
        return { symbols: [], imports: [] };
    try {
        const symbols = [];
        visitChildren(tree.rootNode, symbols, false);
        const imports = [];
        for (const child of tree.rootNode.namedChildren) {
            if (child.type === 'import_statement') {
                const imp = parseImportStatement(child);
                if (imp)
                    imports.push(imp);
            }
        }
        return { symbols, imports };
    }
    finally {
        tree.delete();
    }
}
async function extractSymbols(source, language) {
    const { symbols } = await parseFile(source, language);
    return symbols;
}
const EXTENSIONS_RE = /\.(ts|tsx|js|jsx)$/;
function resolveImportPath(importerFile, importSource) {
    const dir = path_1.default.dirname(importerFile);
    let resolved = path_1.default.normalize(path_1.default.join(dir, importSource));
    resolved = resolved.replace(EXTENSIONS_RE, '');
    resolved = resolved.replace(/\/index$/, '');
    return resolved;
}
function visitChildren(node, symbols, exported) {
    for (const child of node.namedChildren) {
        visitNode(child, symbols, exported);
    }
}
function visitNode(node, symbols, exported) {
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
function handleExportStatement(node, symbols) {
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
function handleFunctionDeclaration(node, symbols, exported) {
    const name = node.childForFieldName('name');
    if (!name)
        return;
    symbols.push({
        name: name.text,
        kind: 'function',
        line: node.startPosition.row + 1,
        exported,
        signature: buildFnSig(node),
    });
}
function handleVariableDeclaration(node, symbols, exported) {
    for (const declarator of node.namedChildren) {
        if (declarator.type !== 'variable_declarator')
            continue;
        const name = declarator.childForFieldName('name');
        const value = declarator.childForFieldName('value');
        if (!name || name.type !== 'identifier')
            continue;
        const isFn = value && ['arrow_function', 'function_expression', 'function'].includes(value.type);
        if (isFn && value) {
            symbols.push({
                name: name.text,
                kind: 'function',
                line: node.startPosition.row + 1,
                exported,
                signature: buildFnSig(value),
            });
        }
        else {
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
function handleTypeAlias(node, symbols, exported) {
    const name = node.childForFieldName('name');
    if (!name)
        return;
    const value = node.childForFieldName('value');
    symbols.push({ name: name.text, kind: 'type', line: node.startPosition.row + 1, exported, signature: value?.text });
}
function handleInterface(node, symbols, exported) {
    const name = node.childForFieldName('name');
    if (!name)
        return;
    const body = node.childForFieldName('body');
    symbols.push({
        name: name.text,
        kind: 'interface',
        line: node.startPosition.row + 1,
        exported,
        signature: body?.text,
    });
}
function handleEnum(node, symbols, exported) {
    const name = node.childForFieldName('name');
    if (!name)
        return;
    const body = node.childForFieldName('body');
    symbols.push({ name: name.text, kind: 'enum', line: node.startPosition.row + 1, exported, signature: body?.text });
}
function handleClass(node, symbols, exported) {
    const name = node.childForFieldName('name');
    if (!name)
        return;
    symbols.push({ name: name.text, kind: 'class', line: node.startPosition.row + 1, exported });
}
function parseImportStatement(node) {
    const sourceNode = node.namedChildren.find((c) => c.type === 'string');
    if (!sourceNode)
        return null;
    const source = sourceNode.text.replace(/['"]/g, '');
    if (!source.startsWith('.'))
        return null;
    const names = [];
    for (const child of node.namedChildren) {
        if (child.type === 'import_clause')
            collectImportNames(child, names);
    }
    if (names.length === 0)
        return null;
    return { names, source, line: node.startPosition.row + 1 };
}
function collectImportNames(clause, names) {
    for (const child of clause.namedChildren) {
        switch (child.type) {
            case 'identifier':
                names.push(child.text);
                break;
            case 'named_imports':
                for (const spec of child.namedChildren) {
                    if (spec.type === 'import_specifier') {
                        const localName = (spec.childForFieldName('alias') ?? spec.childForFieldName('name'))?.text;
                        if (localName)
                            names.push(localName);
                    }
                }
                break;
            case 'namespace_import': {
                const id = child.namedChildren.find((c) => c.type === 'identifier');
                if (id)
                    names.push(id.text);
                break;
            }
        }
    }
}
function buildFnSig(node) {
    const params = node.childForFieldName('parameters');
    const returnType = node.childForFieldName('return_type');
    let sig = params?.text ?? '()';
    if (returnType)
        sig += returnType.text;
    return sig;
}
//# sourceMappingURL=ast.js.map