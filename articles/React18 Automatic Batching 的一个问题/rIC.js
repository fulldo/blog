requestIdleCallback(
  (deadline) => {
    const didTimeout = deadline.didTimeout;
    const timeRemaining = deadline.timeRemaining();

    console.log({ didTimeout, timeRemaining });
    console.log("浏览器空闲了，requestIdleCallback被调用");
    console.log(timeRemaining ? "当前帧还有剩余时间" : "当前帧没有剩余时间了");
    console.log(didTimeout ? "超过 100ms 后被调用" : "没有超过");
    console.log("======做任务====");
  },
  { timeout: 100 }
);
console.time("tt");
var list = [];
var n = Math.random() * 100000000;
for (let i = 0; i < n; i++) {
  list.push(0);
}
console.timeEnd("tt");
