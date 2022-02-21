# 解析函数调用栈为例讲解 TypeScript 静态分析（二）

上篇讲解了一些 TypeScript 操作的 API，本文介绍通过这些 API 如何静态分析代码的函数调用栈，本文[代码实例](https://github.com/fulldo/call-chain-static-analysis/blob/main/extract.js)。

假设我们有如下代码：

```js
function f1() {
  console.log(1);
}

function f2() {
  f1();
}

function f3() {
  f2();
}
```

f3 函数的调用栈是 f3 -> f2 -> f1，我们应该通过静态代码分析出它的调用栈呢？

我们在解析一个 AST 的时候，我们需要记录它的声明，当在某处分析调用时，在声明列表里找该函数，就能分析出函数的调用了。

我们需要遍历每一个节点，解析它的声明和调用关系，我们先声明一个函数声明数组和函数调用 map：

```js
// 函数声明
const allFunctions = [];
// 函数调用 map
const calledFunctions = new Map();
// 正在哪个函数中
let currentFunction = undefined;
```

然后在遍历节点时，在函数声明和函数调用时，分别维护这两个变量，现定义维护函数为 updateCalledFunctions：

```js
// 维护函数声明
function updateDeclaredFunctions(declaredFunction) {
  currentFunction = declaredFunction;
  allFunctions.push(declaredFunction);
}

// 更新当前函数调用栈
function updateCalledFunctions(calledFunction) {
  if (calledFunctions.has(currentFunction)) {
    const pastCalls = calledFunctions.get(currentFunction);
    pastCalls.push(calledFunction);
    calledFunctions.set(currentFunction, pastCalls);
  } else {
    calledFunctions.set(currentFunction, [calledFunction]);
  }
}
```

然后再定义一个解析函数为 extractFunctionCalls，分别解析函数声明和函数调用，如下：

```js
function extractFunctionCalls(node, sourceFile) {
  // 函数声明如 `function hello()`
  if (ts.isFunctionDeclaration(node)) {
    node.forEachChild((child) => {
      if (ts.isIdentifier(child)) {
        const declaredFunction = child.getText(sourceFile);
        updateDeclaredFunctions(declaredFunction);
      }
    });
  }

  // Arrow function
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    ts.isArrowFunction(node.initializer)
  ) {
    const child = node.getChildAt(0, sourceFile);
    if (ts.isIdentifier(child)) {
      const declaredFunction = child.getText(sourceFile);
      updateDeclaredFunctions(declaredFunction);
    }
  }

  // 函数调用
  if (ts.isCallExpression(node)) {
    const child = node.getChildAt(0, sourceFile);
    if (ts.isIdentifier(child)) {
      const calledFunction = child.getText(sourceFile);
      updateCalledFunctions(calledFunction);
    }
  }

  // 递归遍历子节点
  node.forEachChild((child) => extractFunctionCalls(child, sourceFile));
}
```

上面代码判断了函数声明、箭头函数声明，就调用 updateDeclaredFunctions，把该函数名称放进 allFunctions 数组。

解析是函数调用，就调用 updateCalledFunctions，更新 currentFunction。

有了上述解析逻辑，我们就可以获取该 AST 做解析了。

我们需要获取这个文件的第一行文件语法块，然后再分析每一个语法块，根据 TypeScript AST Viewer 可得上面代码的 AST 结构：

```js
SourceFile;
--SyntaxList;
----FunctionDeclaration;
----FunctionDeclaration;
----FunctionDeclaration;
--EndOfFileToken;
```

获取第一行文件语法块（即上面每一个 FunctionDeclaration）：

```js
const rootNodes = [];

let codeAsString;

try {
  codeAsString = fs.readFileSync(filename).toString();
} catch (err) {
  console.log(err);
}

const sourceFile = ts.createSourceFile(
  filename,
  codeAsString,
  ts.ScriptTarget.Latest
);

sourceFile.forEachChild((child) => {
  rootNodes.push(child);
});
```

然后对每层节点再调用 extractFunctionCalls 函数解析：

```js
rootNodes.forEach((node) => {
  currentFunction = undefined;
  extractFunctionCalls(node, sourceFile, 1);
});
```

最后解析出如下结果：

```js
{
  allDeclaration: [ 'f1', 'f2', 'f3' ],
  calledChain: Map(2) { 'f2' => [ 'f1' ], 'f3' => [ 'f2' ] }
}
```

经过处理后，最后调用栈如下：

```js
{
  f3: {
    f2: {
      f1: {
      }
    }
  }
}
```

这样就可以获取函数调用栈了，但是还有这些问题：

- 函数调用在函数声明前，就不好处理
- 函数别名处理起来比较麻烦
- import 进来的函数没处理，处理起来比较麻烦，要解析各种 import / export 语法

下一篇文章讲解利用 TypeScript Service API 解析，以方便的办法解决上面问题。
