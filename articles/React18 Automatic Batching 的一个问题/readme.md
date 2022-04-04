# React18 Automatic Batching 的一个问题

`React` 已经发布了 `18` 的大版本，更新了很多功能，其中有一个功能是自动批处理（`Automatic Batching`）。

在 `ReactV18` 之前，如果不在 `React` 上下文，如 `setTimeout、setInterval、Promise、fetch` 或者 其他原生事件的回调等异步事件，有多次更新 `state` 的操作，都不会合并批处理，即同步执行，有多少次更新，就有多少次 `render`：

```js
// ReactV18以下
function Test() {
  const [count1, setCount1] = useState(0);
  const [count2, setCount2] = useState(0);

  const handleClick1 = () => {
    // 在 React 上下文里，合并更新，会导致执行一次render
    setCount1((c) => c + 1);
    setCount2((c) => c + 1);
  };

  const handleClick2 = () => {
    fetch(location.href).then(() => {
      // 在 React 上下文外，不合并更新，会导致执行两次render
      setCount1((c) => c + 1);
      setCount2((c) => c + 1);
    });
  };

  console.log("render");

  return (
    <div>
      <h1 onClick={handleClick1}>一次render</h1>
      <h1 onClick={handleClick2}>两次render</h1>
    </div>
  );
}
```

如果要实现合并更新，需要这样

```js
fetch(location.href).then(() => {
  unstable_batchedUpdates(() => {
    // 在 React 上下文外，不合并更新，会导致执行两次render
    setCount1((c) => c + 1);
    setCount2((c) => c + 1);
  });
});
```

为什么会这样呢，根据 [这里](https://blog.isquaredsoftware.com/2020/05/blogged-answers-a-mostly-complete-guide-to-react-rendering-behavior/#render-batching-and-timing) `的阐述，React` 在一个同步代码中会调用 `unstable_batchedUpdates` 进行批处理，但异步代码不发生在 `unstable_batchedUpdates` 里面，换句话说，发生在 React 上下文上函数是 `React` 调用的，其他 `setTimeout、setInterval、Promise` 等异步事件回调函数是浏览器调用的，`React` 还不能识别到，所以无法实现自动批处理。

在 `ReactV18` 之后，这些不在 `React` 上下文的多次更新，`React` 也能识别到，都会合并更新，这样对性能非常有用，因为避免了不必要的多次 `rerender。`

```js
fetch(location.href).then(() => {
  // ReactV18在 React 上下文外，也会合并更新，只执行一次render
  setCount1((c) => c + 1);
  setCount2((c) => c + 1);
});
```

如果想保持同步更新，需要调用 `ReactDOM.flushSync`：

```js
fetch(location.href).then(() => {
  ReactDOM.flushSync(() => setCount1((c) => c + 1));
  ReactDOM.flushSync(setCount2((c) => c + 1));
});
```

除了上面说的，升级 `ReactV18` 之后，有些异步行为也会和之前不一样。

看如下代码：

```js
export default function App() {
  const [count1, setCount1] = useState(0);
  const [count2, setCount2] = useState(0);

  const handleClick = () => {
    setTimeout(() => {
      setCount2((c) => c + 1);
    });
    setCount1((c) => c + 1);
  };

  console.log("render");

  return (
    <div>
      <h1 onClick={handleClick}>测试</h1>
    </div>
  );
}
```

点击“测试”，会输出多少次 `render` 呢？

答案是 `2` 次，因为 `setCount2` 是异步事件后的回调函数执行，但是如果改成 `Promise.resolve`，

```js
const handleClick = () => {
  Promise.resolve().then(() => {
    setCount2((c) => c + 1);
  });
  setCount1((c) => c + 1);
};
```

这样会触发多少次重渲染呢？

答案是 `1` 次。

`setTimeout、Promise.resolve` 两个都是异步，为什么两个行为会不一样，一个两次，一个一次呢？

如果在 `ReactV18` 之前，没有 `Automatic Batching`，两个行为都是一样的，渲染两次。`ReactV18` 之后启用了 `Concurrent Render`，而 `Concurrent Render` 会根据任务优先级调度任务，而一次调度在一个事件循环。

`ReactV18` 内部怎么实现一次调度在一个事件循环呢？底层用了 `MessageChannel` 实现。

这个涉及到事件循环，事件循环中有宏任务队列和微任务队列，其中只有一个宏任务队列，而每个任务都有一个微任务队列，一个宏任务属于一个事件循环，每个宏任务执行完之后，会执行当前宏任务产生的所有微任务，然后再取出下一个宏任务，到下一个事件循环。

`MessageChannel` 是宏任务，所以所有一个事件循环的微任务产生的 `setState` 合并后，都会通过 `MessageChannel` 调度到下个事件循环更新。

`Promise` 是微任务， 在 `React` 的一次事件循环中产生的 `setState` 会合并批处理，而 `Promise`.`resolve` 微任务中的 `setCount2` 是 `handleClick` 这个调度中（事件循环）产生的 `setState`，所以会在当次事件循环作合并批处理，然后再下一个事件循环执行 `rerender` 更新。

`setTimeout` 是宏任务，所以在当前事件循环中还没调用 `setState`，所以也就不会触发批处理了，等下一个事件循环再 `setState`，然后下下个事件循环 `rerender`。

这就解释了上面异步任务行为的不同了。

大家可以看看不同版本的异步任务的处理：

[React17 的 demo](https://codesandbox.io/s/busy-grass-nxhiwo)

[React18 的 demo](https://codesandbox.io/s/happy-tree-qldypm)
