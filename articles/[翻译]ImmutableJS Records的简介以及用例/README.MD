# [翻译]ImmutableJS Records的简介以及用例

Post in 2018-09-04.

作者：[Ahmad Bamieh](https://medium.com/@bamieh?source=post_header_lockup)

出处：[https://medium.com/@bamieh/immutablejs-records-bd369137da06](https://medium.com/@bamieh/immutablejs-records-bd369137da06)

>Immutable Records are immutably beautiful! — Ahmad Bamieh  

`Immutable` 的 `Record` 使用起来非常简单，但与比我们经常使用 `Immutable` 的 `Map` 相比，它提供的优势更大。


## Record 的特性

`Record` 跟 `Immutable` 的 `Map` 很像，但是它有以下独特的特点，使它具有特殊性：
1. 一旦构造好，就不能添加更多的属性（`key`）。
2. 可以给 `Record` 的实例定义默认值。
3. `Record` 实例的属性可以像普通 `JS` 对象那样访问，也可以将它删除。
4. 可以对 `Record` 进行命名，以便更好地进行 `debug` 和错误处理。
5. 可以对 `Record` 进行扩展（`extend`），以从 `Record` 中提供派生数据。

这篇文章将讨论以上的所有属性，我们先从创建我们的第一个 `Record` 开始吧！

## 创建 Record

`Record` 方法返回一个构造函数，在该函数中可以生成新的实例。

```js
const LivingCreature = new Immutable.Record({
  name: "Unknown",
  age: 0,
  species: "Human",
});
let fooBar = new LivingCreature({name: "Foo Bar", age: 24});
```

在这段代码中，我们通过 `Record` 创建了一个 `LivingCreature` ，并创建了一个 `LivingCreature` 的实例 `FooBar`。值得注意的是，此实例具有默认的 `Humans` 属性。

## 添加描述

可以给 `Record` 传入第二个参数，用于描述它的特征，该参数将在 `Record` 被转换为字符串或任何错误消息时出现。
```js
const NamedRecord = new Immutable.Record({...}, "[[NAME HERE]]");
```

## 直接访问 Record 的属性

与其他 `Immutable` 的 `JS` `对象不同的是，Record` 实例的属性可以像普通的 `JS` 对象那样访问（ records can be accessed like normal JS objects）。

```js
const {name, species} = fooBar
fooBar.name // Foo Bar
fooBar["species"] // Human
```

## 替换其值

要用另一个 `LivingCreature` 替换 `fooBar`，只需重新赋值。

```js
fooBar = new LivingCreature({name: "Foo Bar Junior", age: 8, species: "Half Blood"});
```

## 更新其值

除了使用 `set` 更新单个值之外，还可以使用 `merge` 一次更新多个值。

```js
fooBar.set("age", 20);
// or
fooBar.merge({
 age: 25,
 species: 12,
})
// Record {name: "Foo Bar Junior", age: 25, species: 12}
```

## 添加新属性
如果你尝试添加未初始化的属性，则该 `record` 将引发错误。以下示例将引发错误：
```js
const newFooBar = new LivingCreature({status: "its complicated"});
const mergeFooBar = fooBar.merge({status: "its complicated"});
```

译者注：在实验过程中，并没有出现上述的报错情况，只是不能 `merge` 成功

## 删除属性
从 `record` 中删除属性只会将其重置为该属性的默认值。

```js
const newFooBar2 = fooBar.remove('name');
console.log(newFooBar2.name) // → "Unknown"
```

派生值
我个人最喜欢 `records` 的一个功能是他们从记录本身中获取数据的能力。
例如，假设我们有一个包含 `itemA、temB` 已经 `sum` 的“购物车”。在通常情况下，每次更新 `itemA、itemB` 值时，我们也必须更新 `sum`。但这不是最好的做法。
看 `records` 是如何的：
```js
class Cart extends Immutable.Record({ itemA: 1, itemB: 2 }) {
  get sum() {
    return this.itemA + this.itemB;
  }
}
var myCart = new Cart()
myCart.sum // 3
```

现在我们可以更新任何值，因为 `sum` 来自 `record` 的属性，所以无需担心或手动更新。

## 总结

`Records` 有一个优点是，允许你的 `Immutable` 对象可以像普通对象一样被处理，具有标准访问器和对象解构，因此任何不可遍对象（`mutate objects`）的库或组件都会欢迎像他们自己的 `records`！
此外，由于在创建 `record` 时必须指定它的属性（`keys`），因此阅读 `record` 将阐明其用途和 `self-document` 的用途。它还强制执行更严格的代码样式，因为你不能再向 `record` 中添加属性。
在使用 `record` 之后，我奇怪它为什么很少谈及，为什么它不是比 `Map Immutable` 更标准。