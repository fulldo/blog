# 解析函数调用栈为例讲解 TypeScript 静态分析（三）

上篇讲了通过逐个分析 AST 的语法节点，解析出函数的调用栈，但是还有这些问题未解决：

- 函数调用在函数声明前，就不好处理
- 函数别名处理起来比较麻烦
- 需要分析整个 AST 的函数声明调用关系后，才能提取某个函数调用栈，非常耗时
- import 进来的函数没处理，处理起来比较麻烦，要解析各种 import / export 语法

这篇文章讲解利用 TypeScript Language Service API 解析某个函数的调用栈，并能容易地解决上述问题。本地代码[完整示例](https://github.com/fulldo/call-chain-static-analysis/blob/main/extract2.js)。

假设我们有如下代码例子：

```js
// src/func.ts
function bb() {}

function aa() {
  bb();
}

export { aa };

// src/test-call-chain2.ts
import { aa } from "./func";

function f11() {
  aa();
}

function f22() {
  f11();
}

function myName() {
  f22();
}

myName();
```

这个例子有复杂的调用栈，并且一个模块中引用了另一个模块的调用，如果我们通过上篇文件的方法解析器调用栈，实现起来非常困难。

以解析 myName 函数的调用栈为切入点，我们怎么方便的实现呢？

这里就要用到 Language Service API 了，下面开始讲解如何操作。

我们希望是通过传入函数名，就能找到这个函数的调用栈，即先通过函数名称，找到 AST 中的语法节点，然后再解析其调用关系。

怎么通过函数名称找到函数的 AST 节点呢？通过遍历 AST 树。遍历 AST 树我们这样这样做：

```js
function visitChildNode(node, visitCallback) {
  if (!node) {
    return;
  }
  node.forEachChild((child) => {
    // 递归遍历
    const visitNext = visitCallback && visitCallback(child);
    // 如果回调函数返回 false，停止遍历
    if (visitNext !== false) {
      visitChildNode(child);
    }
  });
}
```

有了基础的遍历函数，就可以对一颗 AST 进行遍历了。操作 AST 我们需要先拿到 sourceFile，然后在判断 Identifier Node 的名称是否是传入的函数名，所以查找节点函数可以是这样：

```js
function findIdentifierNodeByName(willFindFunctionName, filename) {
  const sourceFile = createSourceFile(filename);
  const rootDeclaredNodes = getRootNodes(sourceFile);

  let functionCallNode;

  for (let i = 0; i < rootDeclaredNodes.length; i++) {
    let nodeItem = rootDeclaredNodes[i];
    visitChildNode(nodeItem, (node) => {
      // 非函数调用节点不处理
      if (!ts.isCallLikeExpression(node)) {
        return;
      }
      node.forEachChild((child) => {
        // 找到不处理
        if (functionCallNode) {
          return;
        }

        if (ts.isIdentifier(child) || ts.isPropertyAccessExpression(child)) {
          const identifierNode = getIdentifierNode(child, sourceFile);
          const functionName = identifierNode.getText(sourceFile);
          // 如果节点的名称是转入的函数，即找到了
          if (functionName === willFindFunctionName) {
            functionCallNode = child;
          }
        }
      });
      // 找到后停止遍历
      if (functionCallNode) {
        return false;
      }
    });
    // 找到后停止循环
    if (functionCallNode) {
      break;
    }
  }

  return functionCallNode;
}
```

找到函数调用节点之后，我们就需要解析这个函数定义声明的位置了，即该函数的 AST 描述。找定义声明，就是要用到我们说的 Language Service API 了。

我们需要创建一个 Language Service，可以通过如下函数创建：

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

有了 Language Service，我们就可以调用其 getImplementationAtPosition、getDefinitionAtPosition 函数分析出函数声明的位置了，可以参考如下实现

```js
// 查找函数声明的位置（代码实现）
function findImplementation(filename, positionStart) {
  let result;
  try {
    result =
      service.getImplementationAtPosition(filename, positionStart + 1) ||
      service.getDefinitionAtPosition(filename, positionStart + 1);
  } catch (error) {
    console.log(error.message);
  }

  const info = result && result[0];

  if (!info) {
    return undefined;
  }

  if (isExcludedInfo(info)) {
    return undefined;
  }

  return info;
}

// 一些不需要的类型要忽略
function isExcludedInfo(info) {
  if (!info) return true;
  // try catch(error)忽略
  // 函数参数声明忽略
  return ["local var", "parameter"].includes(info.kind);
}
```

找到了我们需要分析的函数的声明位置，我们要找到其内部所以的函数调用节点：

```js
// 查找声明节点中的函数调用节点
function getFunctionCallInFunctionDeclare(node, sourceFile, result = []) {
  if (ts.isCallLikeExpression(node)) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      result.push(node);
    } else {
      result.push(node);
    }
  }
  node.forEachChild((child) => {
    getFunctionCallInFunctionDeclare(child, sourceFile, result);
  });
  return result;
}
```

然后递归这个过程，即可实现解析器调用栈了：

```js
function findCallChainWorker(identifierNode, filename, result) {
  const sourceFile = createSourceFile(filename);
  const startPosition = identifierNode.getStart(sourceFile);

  // 找到代码定义实现的节点
  const implementation = findImplementation(filename, startPosition);
  if (implementation) {
    const implementationFilename = implementation.fileName;
    const implementationStart = getInfoStart(implementation);
    // 找到其AST node
    const implementationNode = findNodeByPosition(
      implementationFilename,
      implementationStart
    );
    if (implementationNode) {
      if (isDeclaration(implementationNode)) {
        // 递归检查该AST 所有的函数调用 node
        // console.log("递归检查该AST node");
        const allFunctionCallNodes = getFunctionCallInFunctionDeclare(
          implementationNode,
          sourceFile
        );
        // 递归终止，没有函数调用
        if (!allFunctionCallNodes.length) {
          return { [identifierNode.getText(sourceFile)]: {} };
        }
        allFunctionCallNodes.forEach((functionCallNode) => {
          functionCallNode.forEachChild((child) => {
            if (
              ts.isIdentifier(child) ||
              ts.isPropertyAccessExpression(child)
            ) {
              const childIdentifierNode = getIdentifierNode(child, sourceFile);
              const childIdentifierNodeName =
                identifierNode.getText(sourceFile);

              const childCallChain = this.findCallChainWorker(
                childIdentifierNode,
                implementationFilename,
                {}
              );
              result[childIdentifierNodeName] = childCallChain;
            }
          });
        });
      } else {
        // console.log(
        //   '--->不是声明',
        //   functionName
        // )
      }
    } else {
      // console.log(
      //   '----------->找不到implementationNode'
      // )
    }
  } else {
    console.log("----------->找不到implementation");
  }

  return result;
}
```

最后我们可以得出如下结果：

```js
{
  "myName": {
    "f22": {
      "f11": {
        "aa": {
          "bb": {}
        }
      }
    }
  }
}
```

即我们上面示例代码的函数调用栈！

至此，我们的工作就完成啦，整个过程是不是很简单呢！

不过上面只是一个实现静态解析调用栈的例子，在我的实践中，是分析其调用栈是否有指定函数，还是解决很多问题的，其中比较重点的有如下：

- 大型项目文件成百上千，其解析相当慢，做了很多缓存优化工作
- 如果涉及边编辑代码边解析调用栈，效率需要更高，缓存的处理更复杂
- 因为是递归分析，如果有循环应用的问题，也需要处理

为了实现这个，花费了很多精力，所以有了这三篇文章，希望对读者的相关工作有帮助，就此完毕，谢谢！
