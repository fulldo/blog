# 为什么 React Scheduler 使用 MessageChannel（总结）

## 为什么不直接用 requestIdleCallback

React 的调度原理跟 requestIdleCallback 很像，利用浏览器的空闲时间，但为什么不直接使用而自己实现一个呢？

一个是兼容性很差，可以看[这里](https://caniuse.com/?search=requestIdleCallback)。

另一个是，requestIdleCallback 一秒才调用 20 次，而我们肉眼的流畅度是一秒 60 帧，相差太大了。参考[这里](https://github.com/facebook/react/issues/13206#issuecomment-418923831)和[这里](https://w3c.github.io/requestidlecallback/#bib-responsetime)

## 文章总结 1

来源：[React Scheduler 时间分片为什么选择使用 MessageChannel 实现](https://blog.csdn.net/lunahaijiao/article/details/116549551)

### Scheduler 和 MessageChannel 有啥关系呢？

关键点就在于当  scheduler.shouldYield()  返回  true  后，Scheduler 需要满足以下功能点：

- 暂停 JS 执行，将主线程还给浏览器，让浏览器有机会更新页面
- 在未来某个时刻继续调度任务，执行上次还没有完成的任务

### React Scheduler 使用 MessageChannel 的原因为

生成宏任务，实现：

- 将主线程还给浏览器，以便浏览器更新页面。
- 浏览器更新页面后继续执行未完成的任务。

### 为什么不使用微任务呢？

- 微任务将在页面更新前全部执行完，所以达不到「将主线程还给浏览器」的目的。

### 为什么不使用  setTimeout(fn, 0)  呢？

- 递归的  setTimeout()  调用会使调用间隔变为 4ms，导致浪费了 4ms。

### 为什么不使用  rAF()  呢？

- 如果上次任务调度不是  rAF()  触发的，将导致在当前帧更新前进行两次任务调度。
- 页面更新的时间不确定，如果浏览器间隔了 10ms 才更新页面，那么这 10ms 就浪费了。

## 文章总结 2

来源：[React 框架 | 深入剖析 Scheduler 原理](https://www.cnblogs.com/cczlovexw/p/15789394.html)

### 为什么用 MessageChannel ，而不首选 setTimeout？

如果当前环境不支持 MessageChannel 时，会默认使用 setTimeout

- MessageChannel 的作用
  - 生成浏览器 Eventloops 中的一个宏任务，实现将主线程还给浏览器，以便浏览器更新页面
  - 浏览器更新页面后能够继续执行未完成的 Scheduler 中的任务
  - tips：不用微任务迭代原因是，微任务将在页面更新前全部执行完，达不到将主线程还给浏览器的目的
- 选择 MessageChannel 的原因是因为 setTimeout(fn,0) 所创建的宏任务，会有至少 4ms 的执行时差，setInterval 同理
- MessageChannel 总会在 setTimeout 任务之前执行，且执行消耗的时间总会小于 setTimeout

- 不选择 requestIdelCallback 的原因

  从 React 的 issues 及之前版本（在 15.6 的源码中能搜到）中可以看到，requestIdelCallback 方法也被 React 尝试过，只是后来因为兼容性、不同机器及浏览器执行效率的问题又被 requestAnimationFrame + setTimeout 的 polyfill 方法替代了

- 不选择 requestAnimationFrame 的原因

  在 React 16.10.0 之前还是使用的 requestAnimationFrame + setTimeout 的方法，配合动态帧计算的逻辑来处理任务，后来也因为这样的效果并不理想，所以 React 团队才决定彻底放弃此方法
  requestAnimationFrame 还有个特点，就是当页面处理未激活的状态下，requestAnimationFrame 会停止执行；当页面后面再转为激活时，requestAnimationFrame 又会接着上次的地方继续执行。

### 为什么不用 Generator、Webworkers 来做任务调度

针对 Generator ，其实 React 团队为此做过一些努力

- Generator 不能在栈中间让出。比如你想在嵌套的函数调用中间让出, 首先你需要将这些函数都包装成 Generator，另外这种栈中间的让出处理起来也比较麻烦，难以理解。除了语法开销，现有的生成器实现开销比较大，所以不如不用。
- Generator 是有状态的, 很难在中间恢复这些状态。
