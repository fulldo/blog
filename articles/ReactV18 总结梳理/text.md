# React18更新

## 概况

### 开箱即用的改进

- automatic batching
- new APIs（如 startTransition ）
- 支持 Suspense 的streaming server-side rendering

### Concurrent React 是可选的

- 仅在使用concurrent的时候开启
- 会对构建应用程序的方式产生重大影响

### React Conf 2021 上的分享

- React 18解释

	- https://www.youtube.com/watch?v=FZ0cG47msEk

- 演示了 React 18 中的新功能

	- https://www.youtube.com/watch?v=ytudH8je5ko

- 使用 Suspense 进行流式服务器渲染

	- https://www.youtube.com/watch?v=pj5N-Khihgc

## 什么是Concurrent React

### Concurrency 不是 feature

- 是一种新的幕后机制
- 使 React 能够同时准备多个版本的 U
- 内部实现中使用了复杂的技术

	- 优先级队列
	- 多重缓冲

### synchronous rendering

- 一旦开始，无法中断

### concurrent render

- 更新后如果不改动与之前版本相同

	- 在一个单一的、不间断的、同步的事务中

- 渲染可中断

	- 可能会开始渲染更新，在中间暂停，然后再继续
	- 可能完全放弃正在进行的渲染
	- 保证即使渲染被中断，UI 也会保持一致

- React 可以在后台准备新的内容而不阻塞主线程
- 即使在渲染大型任务，UI 也可立即响应用户输入
- 创造流畅的用户体验

### reusable state

- Concurrent React 可以从屏幕上删除部分 UI

	- 在重用之前的状态时将它们添加回来

- 例如，当用户从一个屏幕上移开并返回时

	- 能够将前一个屏幕恢复到与之前相同的状态

- 计划添加<Offscreen>组件实现此模式

## 向Concurrent靠拢

### concurrent rendering 是 breaking change

- 并发渲染是可中断的
- 启用它时组件的行为会略有不同

### 迁移中有改动，但很少

- 使用新功能的部分才启用concurrent rendering

### 整体升级策略是不破坏现有代码

### 按照自己的节奏逐渐开始添加并发功能

### <StrictMode>帮助发现与concurrent相关的错误

### 升级到 React 18 后

- 能够立即开始使用并发功能
- 使用 startTransition 防止阻塞用户输入
- 使用 DeferredValue 来限制昂贵的 rerender

## Suspense的应用

### 可以开始使用 Suspense 

- 在 Relay、Next.js、Hydrogen 或 Remix 中获取数据
- 获取临时数据在技术上是可行的
- 但仍不建议将其作为一般策略

### 将来会让 Suspense 更易用

- 深度集成到架构中效果最好

	- router
	- data layer
	- server rendering environment

### 还可用 Suspense 在客户端通过 React.lazy 进行代码拆分

### 愿景

- 不仅仅是加载代码
- 扩展对 Suspense 的支持
- 最终相同的 Suspense 回退可以处理任何异步操作

	- 加载代码、数据、图像等

## Server Components还在开发中

### 是即将推出的功能

### 允许构建跨服务器和客户端的应用程序

### 将客户端的丰富交互性与服务器渲染的改进性能相结合

### 本身并不与 Concurrent React 耦合

### 旨在与 Suspense 和流式服务器渲染等 concurrent 功能一起工作

## React 18新功能

### Automatic Batching

- v18之前React 事件之外不会 batched

	- Promise / MutationObserver 
	- setTimeout / setInterval / MessageChannel
	- requestIdelCallback / requestAnimationFrame
	- 原生事件回调等其他其他操作

- v18及之后React 事件之外会 batched

	- 即合并后只渲染一次

### Transitions

- 紧急更新(Urgent updates)

	- 键入、单击、按下等

- 转换更新(Transition updates)

	- 将 UI 从一个视图转换到另一个视图

- 使用 startTransition API 来通知 React 哪些更新是紧急的，哪些是“Transition”
- startTransition

	- 被视为非紧急更新
	- 出现更紧急的更新（如点击或按键），则会中断

- useTransition

	- 跟 startTransition 差不多的hook，但可跟踪状态(pending)

### 新的 Suspense 功能

- 之前只支持使用 React.lazy 进行代码拆分
- 现在支持 “UI loading state”

	- <Suspense fallback={<Spinner />}><Comments /></Suspense>

- 与 transition API 结合使用时效果最佳

### 新的 Client and Server Rendering APIs

- react-dom/client

	- createRoot

		- to create a root to render or unmount
		- 代替ReactDOM.render
		- 开启 React 18 中的新功能

	- hydrateRoot

		- 代替ReactDOM.hydrate
		- 开启 React 18 中的新功能

	- 上面两个都有 onRecoverableError 选项

		- 错误中恢复 / 日志输出

- react-dom/server

	- renderToPipeableStream

		- Node 环境中的流式传输

	- renderToReadableStream

		- 适用于现代边缘运行时环境
		- 如 Deno 和 Cloudflare worker

	- renderToString继续有效，但不鼓励使用

- 新的Strict Mode Behaviors
- 新Hooks

	- useId

		- 在客户端和服务器上生成唯一 ID

	- useTransition

		- 跟 startTransition 差不多的hook，但可跟踪状态(pending)

	- useDeferredValue

		- 推迟重新渲染树的非紧急部分
		- 类似于去抖动
		- 没有固定的时间延迟
		- 渲染是可中断的，不会阻止用户输入

	- useSyncExternalStore

		- https://www.zhihu.com/question/502917860/answer/2252338680
		- 避免并发渲染结果的不一致性(tearing)
		- 旨在供库使用，而不是业务代码

	- useInsertionEffect

		- 工作原理大致与 useLayoutEffect 相同
		- 但此时没法访问 DOM节点的引用
		- 插入全局的DOM节点，比如如<style>
		- 旨在供库使用，而不是业务代码

*XMind: ZEN - Trial Version*