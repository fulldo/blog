# 解析函数调用栈为例讲解 TypeScript 静态分析（一）

有时候我们希望利用 TypeScript 的 API 做一些事情，比如读取某 ts 文件的 AST。这里以解析函数调用栈为例，讲解下做 TypeScript 的静态分析。

本文打算分为三篇：

（一）讲解 TypeScript 提供的一些 NodeJs API

（二）讲解简单解析 TypeScript 文件里面的函数调用栈

（三）讲解利用 TypeScript Service API 解析调用栈

部分示例代码 [github](https://github.com/fulldo/call-chain-static-analysis) 地址。

## 读取文件

要利用 TypeScript 做静态分析，首先要读取 ts 源文件，TypeScript 官方提供了 createSourceFile 函数读取源文件。

以下是 createSourceFile 函数的定义：

```typescript
// 该函数返回 SourceFile 类型的对象
export function createSourceFile(
  fileName: string,
  sourceText: string,
  languageVersion: ScriptTarget,
  setParentNodes?: boolean,
  scriptKind?: ScriptKind
): SourceFile;

// SourceFile 类型定义
export interface SourceFile extends Declaration {
  kind: SyntaxKind.SourceFile;
  statements: NodeArray<Statement>;
  endOfFileToken: Token<SyntaxKind.EndOfFileToken>;
  fileName: string;
  text: string;
  amdDependencies: readonly AmdDependency[];
  moduleName?: string;
  referencedFiles: readonly FileReference[];
  typeReferenceDirectives: readonly FileReference[];
  libReferenceDirectives: readonly FileReference[];
  languageVariant: LanguageVariant;
  isDeclarationFile: boolean;
  hasNoDefaultLib: boolean;
  languageVersion: ScriptTarget;
}

export interface Declaration extends Node {
  _declarationBrand: any;
}

export interface Node extends TextRange {
  kind: SyntaxKind;
  flags: NodeFlags;
  decorators?: NodeArray<Decorator>;
  modifiers?: ModifiersArray;
  parent: Node;
}
```

由上面的类型定义可知，createSourceFile 返回 SourceFile 类型的对象，而改对象是继承于 Node 类型的，是可以理解为 createSourceFile 函数是返回指定 TypeScript 文件的 AST 根节点。

使用示例：

```js
const ts = require("typescript");

const filename = "src/index.ts";
const codeAsString = fs.readFileSync(filename).toString();
const sourceFile = ts.createSourceFile(
  filename,
  codeAsString,
  ts.ScriptTarget.Latest
);

console.log(sourceFile);
```

## 节点操作

### 遍历

可以通过 forEachChild / getChildren 两个 API 递归遍历 AST：

```js
const ts = require("typescript");

const filename = "src/index.ts";
const codeAsString = fs.readFileSync(filename).toString();
const sourceFile = ts.createSourceFile(
  filename,
  codeAsString,
  ts.ScriptTarget.Latest
);

// forEachChild
function visitNode1(node) {
  node.forEachChild((child) => {
    visitNode1(child);
  });
}

visitNode1(sourceFile);

// getChildren
function visitNode2(node) {
  node.getChildren(sourceFile).forEach((child) => {
    visitNode2(child);
  });
}

visitNode2(sourceFile);
```

### 其他

定义：

```typescript
interface Node {
  getSourceFile(): SourceFile;
  getChildCount(sourceFile?: SourceFile): number;
  getChildAt(index: number, sourceFile?: SourceFile): Node;
  getChildren(sourceFile?: SourceFile): Node[];
  getStart(sourceFile?: SourceFile, includeJsDocComment?: boolean): number;
  getFullStart(): number;
  getEnd(): number;
  getWidth(sourceFile?: SourceFileLike): number;
  getFullWidth(): number;
  getLeadingTriviaWidth(sourceFile?: SourceFile): number;
  getFullText(sourceFile?: SourceFile): string;
  getText(sourceFile?: SourceFile): string;
  getFirstToken(sourceFile?: SourceFile): Node | undefined;
  getLastToken(sourceFile?: SourceFile): Node | undefined;
  forEachChild<T>(
    cbNode: (node: Node) => T | undefined,
    cbNodeArray?: (nodes: NodeArray<Node>) => T | undefined
  ): T | undefined;
}
```

一些示例：

```js
const ts = require("typescript");

const codeAsString = `ReactDOM.render(
  <h1>Hello, world!</h1>,
  document.getElementById('root')
);
`;
const sourceFile = ts.createSourceFile(
  "index.ts",
  codeAsString,
  ts.ScriptTarget.Latest
);

const rootNode = sourceFile;

console.log(rootNode.getChildCount());
// 2
console.log(rootNode.getChildAt(0, sourceFile).getText(sourceFile));
/**
ReactDOM.render(
  <h1>Hello, world!</h1>,
  document.getElementById('root')
);
 */
console.log(rootNode.getStart(sourceFile));
// 0
console.log(rootNode.getFullStart());
// 0
console.log(rootNode.getEnd());
// 80
console.log(rootNode.getWidth());
// 80
console.log(rootNode.getFullWidth());
// 80
console.log(rootNode.getText());
/**
ReactDOM.render(
  <h1>Hello, world!</h1>,
  document.getElementById('root')
);
 */
```

### 更多操作 API

[TypeScript Transformer Handbook](https://github.com/madou/typescript-transformer-handbook)

## 节点类型判断

TypeScript 提供一系列的 API 用于判断节点的类型，是 import 语法、export 语法、函数声明还是其他，下面是一些 API ：

```js
ts.isImportDeclaration
ts.isImportClause
ts.isStringLiteral
ts.isIdentifier
ts.isNamedImports
ts.isImportSpecifier
ts.isVariableDeclaration
ts.isArrowFunction
ts.isFunctionDeclaration
ts.isCallLikeExpression
ts.isJsxSelfClosingElement
ts.isJsxOpeningElement
ts.isPropertyAccessExpression
ts.isJsxAttributes
...


```

关于节点类型可以看[这里](https://github.com/meriyah/meriyah/issues/35)

## 读取 tsconfig.json

如果需要读取 tsconfig.json 的内容，可以直接 require ，但是如果有注释会报错，不建议这样直接引用。

可以使用 parseConfigFileTextToJson ：

```js
const ts = require("typescript");

const jsonText = `{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "moduleResolution": "node",
    "jsx": "react"
  },
  "include": ["src"]
}`;

console.log(ts.parseConfigFileTextToJson("tsconfig.json", jsonText));
// 结果
{
  config: {
    compilerOptions: { lib: [Array], moduleResolution: 'node', jsx: 'react' },
    include: [ 'src' ]
  },
  error: undefined
}

```

读取 compilerOptions，根据 tsconfig.json 文件路径获取：

```js
const tsParsedConfig = ts.readJsonConfigFile(
  "path/to/tsconfig.json",
  ts.sys.readFile
);
const compilerOptions = ts.parseJsonSourceFileConfigFileContent(
  tsParsedConfig,
  ts.sys,
  path.dirname("path/to/tsconfig.json")
).options;

console.log(compilerOptions);
```

根据 json 内容获取：

```js
// 读取到的 tsconfig.json 文件内容
const tsConfigContent = {
  compilerOptions: {
    lib: ["dom", "dom.iterable", "esnext"],
    moduleResolution: "node",
    jsx: "react",
  },
  include: ["src"],
};
const compilerOptions = ts.convertCompilerOptionsFromJson(
  tsConfigContent.compilerOptions
).options;

console.log(compilerOptions);
```

## 获取文件全路径

import 文件时，我们引入的路径一般是相对路径，如果我们想把相对路径转为绝对路径，可以这样做：

```js
const ts = require("typescript");
const path = require("path");

function getCompilerOptionsFromTsConfig(tsConfig) {
  let compilerOptions = {};

  if (tsConfig) {
    if (typeof tsConfig === "string") {
      try {
        const tsParsedConfig = ts.readJsonConfigFile(tsConfig, ts.sys.readFile);
        compilerOptions = ts.parseJsonSourceFileConfigFileContent(
          tsParsedConfig,
          ts.sys,
          path.dirname(tsConfig)
        ).options;
      } catch (e) {
        throw new Error("could not read tsconfig");
      }
    } else {
      compilerOptions = ts.convertCompilerOptionsFromJson(
        tsConfig.compilerOptions
      ).options;
    }
  }

  return compilerOptions;
}

module.exports.tsLookup = function tsLookup({
  dependency,
  filename,
  tsConfig,
  noTypeDefinitions,
}) {
  let compilerOptions = getCompilerOptionsFromTsConfig(tsConfig);

  if (!compilerOptions.module) {
    compilerOptions.module = ts.ModuleKind.AMD;
  }

  const host = ts.createCompilerHost({});

  const namedModule = ts.resolveModuleName(
    dependency,
    filename,
    compilerOptions,
    host
  );
  let result = "";

  if (namedModule.resolvedModule) {
    result = namedModule.resolvedModule.resolvedFileName;
    if (namedModule.resolvedModule.extension === ".d.ts" && noTypeDefinitions) {
      result =
        ts.resolveJSModule(dependency, path.dirname(filename), host) || result;
    }
  } else {
    const suffix = ".d.ts";
    const lookUpLocations = namedModule.failedLookupLocations
      .filter((string) => string.endsWith(suffix))
      .map((string) => string.substr(0, string.length - suffix.length));

    result = lookUpLocations.find(ts.sys.fileExists) || "";
  }

  return result ? path.resolve(result) : "";
};
```

## Complier API

利用 TypeScript Complier API 可以通过 NodeJs 方式的调用去编译 TypeScript 代码、 JavaScript 文件中得到 DTS、检查语法等等。

TypeScript Complier API 提供的原文 Wiki：[Using-the-Compiler-API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)

中文翻译版：[使用 TypeScript complier API](https://zhuanlan.zhihu.com/p/141410800)

一个编译 TypeScript 代码的例子：

```js
const ts = require("typescript");

const source = "let x: string = 'string'";

let result = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

console.log(result.outputText);
// var x = 'string';
```

## LanguageService API

LanguageService 是 TypeScript 的一个高级功能，为编译器（如 vscode）封装的一层接口，适用于编辑器一类的应用，包括：

1. 自动补全、函数签名提示、格式化和高亮、着色等
2. 基本重构功能，如重命名
3. 调试接口助手，如断点验证
4. TS 特有的增量编译（--watch）

上述[原文来源](https://github.com/microsoft/TypeScript/wiki/Architectural-Overview/_compare/9031a90e8d9d759fecda5c9e0f6b854cebea01a8)，中文的[翻译来源](http://www.javashuo.com/article/p-cievbmmr-kk.html)。

LanguageService 对象有很多函数，可以在 node_modules/typescript/lib/typescript.d.ts 查看，这里介绍几个：

```typescript
interface LanguageService {
  // 查找指定位置变量类型定义的地方，类似于 vscode 在某处变量右击的“Go to Definition”
  getDefinitionAtPosition(
    fileName: string,
    position: number
  ): readonly DefinitionInfo[] | undefined;
  // 查找指定位置变量定义实现的地方，类似于 vscode 在某处变量右击的“Go to Implementations
  getImplementationAtPosition(
    fileName: string,
    position: number
  ): readonly ImplementationLocation[] | undefined;
  // 查找指定位置变量被引用的地方，类似于 vscode 在某处变量右击的“Go to References
  getReferencesAtPosition(
    fileName: string,
    position: number
  ): ReferenceEntry[] | undefined;
}
```

使用 LanguageService 的 case：

```js
const fs = require("fs");
const ts = require("typescript");
const path = require("path");

const parseTsConfigJson = (tsconfigPath) => {
  const basePath = path.resolve(path.dirname(tsconfigPath));

  const parseJsonResult = ts.parseConfigFileTextToJson(
    tsconfigPath,
    fs.readFileSync(tsconfigPath, { encoding: "utf-8" })
  );

  const tsConfig = ts.parseJsonConfigFileContent(
    parseJsonResult.config,
    ts.sys,
    basePath
  );

  return tsConfig;
};

const createService = () => {
  // tsconfig.json文件的路径
  const config = parseTsConfigJson("tsconfig.json");
  const rootFileNames = new Set(config.fileNames);
  const fileVersions = new Map(
    Array.from(rootFileNames).map((fileName) => [fileName, 0])
  );
  const service = ts.createLanguageService(
    {
      getScriptFileNames: () => Array.from(rootFileNames),
      getScriptVersion: (fileName) => {
        const version = fileVersions.get(fileName);
        return version ? version.toString() : "";
      },
      getScriptSnapshot: (fileName) => {
        if (!fs.existsSync(fileName)) {
          return undefined;
        }

        return ts.ScriptSnapshot.fromString(
          fs.readFileSync(fileName).toString()
        );
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => ({
        ...config.options,
        sourceMap: false,
        target: 3,
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    },
    ts.createDocumentRegistry()
  );
  return service;
};
```

上面的 createService 函数就可以创建 LanguageService 对象了。

假设有如下一个文件：

```js
// src/index.ts
const a = 123;

console.log(a);
```

然后利用 LanguageService 尝试查看变量的定义和引用：

```js
const service = createService();

// 43 是变量 a 使用的位置（pos），通过 https://ts-ast-viewer.com/ 可以查到
console.log(service.getDefinitionAtPosition("src/index.ts", 43));
// 结果，找到 a 变量定义的位置（textSpan）
[
  {
    fileName: "src/index.ts",
    textSpan: { start: 22, length: 1 },
    kind: "const",
    name: "a",
    containerKind: undefined,
    containerName: "",
    contextSpan: { start: 16, length: 13 },
    isLocal: false,
  },
];

// 21 是变量 a 定义的位置（pos），通过 https://ts-ast-viewer.com/ 可以查到
console.log(service.getReferencesAtPosition("src/index.ts", 21));
// 结果，找到 a 变量被引用的位置（textSpan）
[
  {
    textSpan: { start: 22, length: 1 },
    fileName: "src/index.ts",
    contextSpan: { start: 16, length: 13 },
    isWriteAccess: true,
    isDefinition: true,
    isInString: undefined,
  },
  {
    textSpan: { start: 43, length: 1 },
    fileName: "src/index.ts",
    isWriteAccess: false,
    isDefinition: false,
    isInString: undefined,
  },
];
```
