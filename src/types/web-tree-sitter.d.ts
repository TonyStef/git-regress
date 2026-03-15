declare module 'web-tree-sitter' {
  namespace Parser {
    interface Point {
      row: number;
      column: number;
    }

    interface EmscriptenModule {
      locateFile?(scriptName: string, prefix: string): string;
    }

    class SyntaxNode {
      type: string;
      text: string;
      startPosition: Point;
      endPosition: Point;
      startIndex: number;
      endIndex: number;
      children: SyntaxNode[];
      namedChildren: SyntaxNode[];
      childForFieldName(fieldName: string): SyntaxNode | null;
      child(index: number): SyntaxNode | null;
      parent: SyntaxNode | null;
      childCount: number;
      namedChildCount: number;
      firstChild: SyntaxNode | null;
      lastChild: SyntaxNode | null;
      nextSibling: SyntaxNode | null;
      previousSibling: SyntaxNode | null;
      isNamed: boolean;
      toString(): string;
    }

    class Tree {
      rootNode: SyntaxNode;
      delete(): void;
    }

    class Language {
      static load(input: string | Uint8Array): Promise<Language>;
    }
  }

  class Parser {
    static init(moduleOptions?: Partial<Parser.EmscriptenModule>): Promise<void>;
    static Language: typeof Parser.Language;
    constructor();
    setLanguage(language: Parser.Language | null): this;
    parse(input: string): Parser.Tree | null;
    delete(): void;
  }

  export = Parser;
}
