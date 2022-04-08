# 无限滚动分页加载更多的 React Hook 实现

在移动端列表场景开发中，分页加载往往都是无限滚动，而这部分场景一般有这些逻辑需要实现
- 列表数据管理：首次拉取、加载更多、刷新、删除等
- 请求参数管理：`pageNumber`、`pageSize`、其他业务参数等
- `total`、`hasMore` 管理
- `loading` 态、成功态、失败态处理
  
这些逻辑很多时候都是一样的，可以对它们做一次抽象封装，达到可复用的目的。现在大多时候都是基于 `React` 开发，所以封装成 `hook` 的形式。

我这里将该 `hook` 命名为 `useLoadMoreList`，以下讲解这个 `hook` 的实现过程。

本地完整代码可在 [这里](https://github.com/fulldo/use-load-more-list) 查看。

## API 定义

### hook 的调用输入
```typescript
export interface UseLoadMoreListConfig<Result, Params> {
  // 后端列表数组对应的key值，比如后端返回的是 { result: [], total: 0 } ，那么可以就是'result'，默认是"data"
  dataKey?: string
  // total 字段后端给的 key（防止后端搞特殊乱起名字），默认"total"
  totalKey?: string
  // 用于去重，项数据唯一标识的key，带删除功能的数据必须给出
  idKey?: string | number
  // 暂时只支持初始化的时候传入
  pageSize?: number
  // 是否自动触发请求 默认为true
  autoRun?: boolean
  // request函数除了 pageNumber，pageSize 以外的其他参数
  params?: Omit<Params, 'pageNumber' | 'pageSize'>
  // 错误回调
  errorCallback?<T = any>(error: T): void
  // 成功回调，如果列表是可删除的，可能会被多次调用，最好不要操作result的数据
  successCallback?(result: Result): void
  // 对返回的数据进行转换
  transformResponse?: (result: any) => any
}

// 请求函数的返回结果
export interface Result {
  [dataKey: string]: any
}
```

### hook state

核心 `state`，通过 `hook` 内部维护并返回：

```typescript
export interface State<Data, Extra> {
  // 初始值为 0
  pageNumber: number
  // 初始值为 0
  total: number
  // 初始值为 true
  loading: boolean
  // 初始值为 null
  error?: any | null
  // 初始值为 undefined
  data?: Data[]
  // 接口返回的数据，除了 总数 & 列表数据 字段外
  extra?: Extra
}
```

### hook 返回值

上面的 `state` & 控制 `state` 值的函数的返回值，`extends` 上面的 `State<Data>`

```typescript
export interface ReturnObject<Data, Extra> extends State<Data, Extra> {
  // 是否还有更多数据，初始值为false
  hasMore: boolean
  // 数据重置 & 重新获取
  reset(isClearAfterRequestSuccess?: boolean): Promise<void>
  // 触发请求（跟调用reset函数效果一样）
  run(): Promise<void>
  // 获取下一页数据
  getNextPage(): Promise<void>
  // 删除某项数据，删除数量超过deleteCountOfAutoUpdate会自动获取下一页
  deleteDataById(id: number | string, deleteCountOfAutoUpdate?: number): void
}

```

## hook 实现

### 数据层管理

对于基于 `hook` 的数据管理，一般都用 `useState`，但是 `useState` 的功能太过基础，对于复杂的数据，不太好管理。

所以我用到另外一个基于 `Flux` 数据流管理的 `hook`：`useReducer`。

基于它的思想，我们将数据层分为 `state`、`action`、`reducer`。

### state

`reducer` 里面有一个初始 `state`，为了确保每次恢复到初始 `state` 是都是一个新引用，将它定义为一个名为 `getInitState` 的函数。

它接受 `Data`， `Extra` 泛型参数，传递给我们什么定义的 `State` 类型。

```typescript
// 默认在第一页
export const DEFAULT_PAGE_NUMBER = 1

export function getInitState<Data, Extra>(): State<Data, Extra> {
  return {
    data: undefined,
    pageNumber: DEFAULT_PAGE_NUMBER,
    total: 0,
    error: null,
    loading: true
  }
}
```

### action

在 `Flux` 的思想中，去更改一个 `state`，需要 `dispatch` 一个 `action`，这里我们定义其中 `action` 类型：

```typescript
export const actionType = {
  BEFORE_REQUEST: 'BEFORE_REQUEST', // 请求之前的操作，如更改 loading 态为 true
  RESET: 'RESET', // 重置操作，如刷新
  REQUEST_FAIL: 'REQUEST_FAIL', // 请求失败操作
  REQUEST_SUCCESS: 'REQUEST_SUCCESS', // 请求成功操作，追加数据源
  DELETE: 'DELETE' // 删除数据项
}
```

然后定义我们的 `Action` 接口，必须是上面的 `actionType`：

```typescript
export interface Action {
  type: keyof typeof actionType
  payload?: any
}
```

### reducer

最后进行修改数据源的，是`reducer`，`action` 只是一个通知 `reducer` 去修改数据的动作。

`reducer` 通过判别不同的类型去更改数据源，基础形式如下：

```typescript
function reducer(state = getInitState<any, any>(), action: Action) {
  const payload = action.payload
  switch (action.type) {
    case xxx: {
        ...
        return newState
    }
    case yyy: {
        ...
        return newState
    }
    default: {
      throw new Error('type 错误')
    }
  }
}
```

这里定义 `reducer` 默认 `state` 如果不传的话，就调用 `getInitState` 获取默认值，指定 `action` 为 `Action` 类型。

然后根据不同的 `actionType` 做不同的操作。

#### BEFORE_REQUEST

需要把 `loading` 态设置为 `true`：

```typescript
case actionType.BEFORE_REQUEST: {
    return {
      ...state,
      loading: true
    }
}
```

#### REQUEST_SUCCESS

请求成功，更新数据，这里只要处理的是追加数据：

```typescript
case actionType.REQUEST_SUCCESS: {
  const { data, idKey, pageNumber, total, extra } = payload
  // 如果不是第一页就追加数据，否则直接用传入的
  let newData =
    state.data && pageNumber !== DEFAULT_PAGE_NUMBER ? state.data.concat(data) : data
  if (idKey) {
    // 数据去重，主要是应用于删除场景的唯一标识
    newData = deDuplication(newData, idKey)
  }
  return {
    ...state,
    total,
    extra, // 除基础数据外的额外数据，又逻辑层传入
    pageNumber,
    error: null, // 需要对 error 置空，避免受上一次请求失败的影响
    loading: false,
    data: newData
  }
}
```

#### REQUEST_FAIL

请求失败，暴露 `error` 信息，恢复 `loading` 为 `false`：

```typescript
case actionType.REQUEST_FAIL: {
  const { error } = payload
  return {
    ...state,
    error,
    loading: false
  }
}
```

#### DELETE

删除数据，这部分操作的 `case` 在数据层还比较简单，只是过滤掉对应 `id` 的数据，但在后面逻辑层还是有一点复杂的：

```typescript
case actionType.DELETE: {
    const { id, idKey } = payload
    if (!state.data) {
      return state
    }
    const newData = state.data.filter(item => {
      const dataId = (item as any)[idKey]
      return dataId !== id
    })
    return {
      ...state,
      total: state.total - 1,
      data: newData
    }
  }
  case actionType.RESET: {
    return { ...getInitState() }
  }
  default: {
    throw new Error('type 错误')
  }
}
```

#### 工具函数

```typescript
// 数据项去重
function deDuplication<T>(data: T[], idKey: string | number): T[] {
  // id -> 数组index 的映射，方便查找
  const idToIndex = {} as { [id: string]: number }
  const ids = data.map((d: any, index) => {
    const id = d[idKey]
    // 缓存 id -> index 的映射
    idToIndex[id] = index
    if (typeof d[idKey] === 'undefined') {
      throw new Error('idKey输入错误')
    }
    return id
  })

  const uniqueIds = unique(ids)
  return uniqueIds.map(id => data[idToIndex[id]])
}
// 基础数据去重
function unique<T>(arr: T[]) {
  return Array.from(new Set(arr))
}
```

这样就完成了我们对数据层的定义了，完全把数据与实现逻辑解耦，让数据操作更纯粹、更清晰。

### 逻辑层

逻辑层是整个 `hook` 的核心实现，也是里面比较复杂的一部分，下面我们看看它是怎么实现的。

#### 函数定义

```typescript
import { Result, UseLoadMoreListConfig, ReturnObject } from './types';
declare const useLoadMoreList: <Data extends object, Params extends {
    pageNumber: number;
    pageSize: number;
} = any, Extra = {
    [key: string]: any;
}>(request: (params: Params) => Promise<Result>, config: UseLoadMoreListConfig<Result, Params>) => ReturnObject<Data, Extra>;
export default useLoadMoreList;

```

这里定义了 `useLoadMoreList` 这个 `hook` 函数，接受继承于 `object` 的 `Data` 和必须传入 `pageNumber`、`pageSize` 的 `Params` 以及 `key`、`value `结构 `Extra` 的三个泛型。

其中 `useLoadMoreList` 函数包括 `request` 和 `config` 两个参数，
- `request` 一个返回 `Promise` 的函数
- `config` 是基于 `UseLoadMoreListConfig` 类型的一个 `object`

最后返回了类型为 `ReturnObject` 的对象。

#### 基础 state 和配置
```typescript
// 默认每页大小
const DEFAULT_PAGE_SIZE = 10
// 初始state，默认 loading 为 false，然后与数据层的 state 和并
const getDefaultState = (config: UseLoadMoreListConfig<any, any>) => ({
  ...getInitState<any, any>(),
  loading: !!config.autoRun
})

// 默认传入的配置
const defaultConfig = {
  dataKey: 'data', 
  totalKey: 'total',
  autoRun: true
}
```

#### 初始化内部状态

```typescript
  // 防止多次请求
const lockingRef = useRef(false)
// 确保 config 的参数被更改能同步更新
const configRef = useRef({ ...defaultConfig, ...config })
const [state, dispatch] = useReducer<Reducer<State<Data, Extra>, Action>>(
  reducer,
  getDefaultState(configRef.current)
)
// 删除的数量
const deleteCountRef = useRef(0)
const { pageSize = DEFAULT_PAGE_SIZE } = configRef.current
const hasMore = state.pageNumber * pageSize < state.total

// 同时还需保持 config current 最新
useEffect(() => {
  configRef.current = { ...defaultConfig, ...config }
})

```

为了防止多次请求导致数据错乱，添加了 `lockingRef` 锁。

然后对传入的 `config` 与 `defaultConfig` 做一个合并，放放在 `ref` 里面，保证数据是最新的。

然后我们通过调用 `useReducer` 初始化 `state`，`dispatch`、`state` 用于返回给调用方，`dispatch` 用户更新数据层。

然后初始化了 `deleteCountRef`，主要用于计算删除的数量然后作何种更新操作，后面会讲。

然后获取了传入的 `pageSize`。

最后是衍生计算 `hasMore`，这个计算比较特别。我们想象，如何确定当前数据还有更多呢，有或者没有都有什么特征呢？

最直观能想到的是，如果还有更多数据，则当前页数量等于 `pageSize`，没有则小于 `pageSize`。

但这种还是有点不足之处，如果没有数据了，当前页数量又刚好等于 `pageSize` 呢？这样是不是进行下一页的请求，下一页返回空，才能判断是不是还有更多数据。

这样的办法可以是可以，但是无形中增加了一次请求，是没有必要的。

还有一种办法是，如果没有更多数据了，那么 `pageNumber * pageSize < total`，这种相比上面的，会更好一点，极端情况不用多余的请求。

不过如果 `pageSize` 变了，就可能不准了，但大多情况下 `pageSize` 变了肯定也会重新开始第一页获取数据，这种情况不用担心。

另外在无限滚动的情况下，`pageNumber` 也只能是递增，所以这种办法的没问题的。

#### 清空内部状态

在刷新的情况需要清空内部状态，封装 `clear` 函数和 `reset` 函数
```typescript
const clear = () => {
  dispatch({ type: 'RESET' })
  deleteCountRef.current = 0
}

const reset = (isClearAfterRequestSuccess = false) => {
  if (!isClearAfterRequestSuccess) clear()
  return baseQuery({ pageNumber: DEFAULT_PAGE_NUMBER }, isClearAfterRequestSuccess)
}
```

`reset` 函数有个 `isClearAfterRequestSuccess` 参数，如果为 `true`，我们就会先清空内部状态再请求。

如果先清空再请求，那么列表会为空，然后等请求成功后，列表又会马上渲染出来，会有抖动的感觉，在保证体验的情况下，默认为 `false`，也建议用 `false`。

`baseQuery` 函数是我们的请求后端接口获取列表数据的函数，后面讲解。

#### 请求后端接口数据

这个部分是逻辑比较多的部分，核心点请求前后 `loading` 态和请求锁的处理，和获取数据后的数据更新，详细看注释：
```typescript
const baseQuery = async ({ pageNumber }: { pageNumber: number }, isReset: boolean = false) => {
  // 解构配置参数供后方使用
  const {
    idKey,
    params,
    dataKey = 'data',
    totalKey = 'total',
    errorCallback,
    successCallback,
    transformResponse,
    pageSize = DEFAULT_PAGE_SIZE
  } = configRef.current
  // 获取请求参数，主要是一些除了 pageSize / pageNumber 外的页务参数
  const requestParams = (params || {}) as Params
  // 请求锁，防止同时多次请求导致乱序
  if (lockingRef.current) return
  lockingRef.current = true
  // 如果是请求前清空，则先清空数据
  if (isReset) clear()
  // 请求前状态变更，主要 loading 态变更
  dispatch({ type: 'BEFORE_REQUEST' })
  // 向后端发起请求，并返回 Promise，方便调用方处理
  return request({
    ...requestParams,
    pageNumber,
    pageSize
  })
    .then(result => {
      // 对数据进行转换
      if (transformResponse) result = transformResponse(result)
      // 执行传入的成功回调
      if (successCallback) successCallback(result)
      // 通过传入的 dataKey 和 totalKey 取到 dataList 和 total
      let { [dataKey]: responseData, [totalKey]: total, ...otherResult } = result
      // 把数据传到数据层处理
      dispatch({
        type: 'REQUEST_SUCCESS',
        payload: {
          idKey,
          total,
          pageNumber,
          data: responseData,
          extra: otherResult
        }
      })
    })
    .catch(error => {
      // 失败梳理，调用传入的回调
      if (errorCallback) errorCallback(error)
      // 通知数据层变更数据
      dispatch({
        type: 'REQUEST_FAIL',
        payload: { error }
      })
      console.log(error)
    })
    .finally(() => {
      // 解锁
      lockingRef.current = false
    })
}

useEffect(() => {
  // 获取数据
  if (configRef.current.autoRun) {
    baseQuery({ pageNumber: state.pageNumber })
  }
}, [])
```

#### 获取下一页数据和删除某数据项

获取下一页数据和删除某数据项的处理可以说是这个 `hook` 相比同类产品有特色的一点，他把这部分的处理封装在 `hook` 内部，不需要使用者过多处理数据变化导致数据列表与预期不一致的影响，数据变化的使用更方便。

因为有删除数据的情况存在，这部分也比较复杂，我们看以下的例子。

假设我们数据库有这些数据，共有 `10` 个数据，如果每页 `5` 个，可以分成 `2` 页： 
|               |       |       |       |       |
|  ----         | ----  | ----  | ----  | ----  |
| page1：item1  | item2 | item3 | item4 | item5 |
| page2：item6  | item7 | item8 | item9 | item10 |

假设获取到了第一页：

|               |       |       |       |       |
|  ----         | ----  | ----  | ----  | ----  |
| page1：item1  | item2 | item3 | item4 | item5 |

我们删除 `item3`，变成这样：

|               |       |       |       |
|  ----         | ----  | ----  | ----  |
| page1：item1  | item2 | item4 | item5 |

然后我们想获取第二页，我们理想中第二页的数据是这样：

|               |       |       |       |       |
|  ----         | ----  | ----  | ----  | ----  |
| page2：item6  | item7 | item8 | item9 | item10 |

但是实际上是这样：
|               |       |       |       |
|  ----         | ----  | ----  | ----  |
| page2：item7 | item8 | item9 | item10 |

`item6` 不见了。因为数据库的 `item3` 删除了，分页时，`item6` 就属于第 `1` 页的情况了，这样我们直接获取第 `2` 页的数据是有问题的。

怎么解决这个问题呢？

首先我们删除一个项数据，肯定是通过一个 `id` 去删除，所以我们回到我们之前定义传入的配置 `idKey` 属性，这个更新合并数据的关键属性。 

还有 `deleteCountRef`，我们在每一次删除的时候，都对它递增 `1`，看 `deleteDataById` 函数实现：
```typescript
/**
 * 通过 id 删除数据
 * @param id 要被删除数据的唯一 id
 * @param deleteCountOfAutoUpdate 可选，设置连续删除多少个数据后，向后端更新数据
 * @returns 
 */
const deleteDataById = (id: number | string, deleteCountOfAutoUpdate = 0) => {
  const { idKey } = configRef.current
  if (!state.data) return
  // 需要数据的唯一 id 用于后面的数据合并去重
  if (!idKey) throw new Error('没有输入唯一的idKey')
  // 通知数据层删除数据
  dispatch({ type: 'DELETE', payload: { id, idKey } })
  // 被删除数量递增 1
  deleteCountRef.current++
  // 在有删除的场景，如果删除的数量超过了输入会删除后自动更新的数量，就自动获取下一页
  if (deleteCountOfAutoUpdate && deleteCountOfAutoUpdate <= deleteCountRef.current) {
    // 获取下页数据，看后面实现
    getNextPage()
  }
}
```

关键就在 `getNextPage`，这里在 `getNextPage` 中维护了这个删除关系，避免出现漏取数据，保证后续数据的完整性。

如何保证数据完整性呢？这里的思路是：
- 如果获取下一页前，没有删除过数据，直接获取下一页
- 如果获取下一页前，有删除过数据，则刷新被删除数据总计页数的数据，再获取下一页的
  - 将删除数量 `deleteCount` 与 `pageSize` 取余，得到 `remainder`
  - 通过 `remainder` 计算刷新需更新页数 `fetchCount`
  - 如果余数为 `0`，`fetchCount` 为 `1`，即直接获取一页（亦即是下页都是最新数据）
  - 如果余数不为 `0`，
    - 小于 `pageSize` 一半，`fetchCount` 为 `2`（刷新当前页数据，当前页重复比较多，还要获取下一页数据）
    - 大于 `pageSize` 一半，`fetchCount` 为 `1`（直接更新当前数据，因为重复的也不多）
  - 计算需要回退到的刷新数据的页数 `willBackwardsPageCount`
  - 循环 `fetchCount`，递减知道其等于 `0`
    - 通过 `pageNumber - willBackwardsPageCount` 计算回退后的页码 `willFetchPageNumber`
    - 调用 `baseQuery` 更新数据（`baseQuery` 后，会对里面的数据去重）
    - 递减 `willBackwardsPageCount`
    - 因当前页已刷新，重置 `deleteCountRef` 为 `0`

以上是 `getNextPage` 的逻辑，下面看下代码实现：
```typescript
const getNextPage = async () => {
  let pageNumber = state.pageNumber
  let deleteCount = deleteCountRef.current
  try {
    // 没有删除过数据，直接获取下一页
    if (!deleteCount) {
      await baseQuery({ pageNumber: state.pageNumber + 1 })
      return Promise.resolve()
    }
    // 如果 删除的数量跟pageSize取余的结果，比pageSize还小，就获取两次数据
    let remainder = deleteCount % pageSize
    // 计算 fetchCount
    let halfOfPageSize = pageSize / 2
    let fetchCount = remainder ? (remainder < halfOfPageSize ? 2 : 1) : 1
    // 删除数量少于pageSize，不需要回退
    let willBackwardsPageCount = deleteCount > pageSize ? Math.floor(deleteCount / pageSize) : 0
    while (fetchCount--) {
      // 后退之后，将要获取的页码
      const willFetchPageNumber = pageNumber - willBackwardsPageCount
      await baseQuery({ pageNumber: willFetchPageNumber })
      willBackwardsPageCount--
      deleteCountRef.current = 0
    }
    return Promise.resolve()
  } catch (error) {
    return Promise.reject(error)
  }
}
```

#### 返回数据

最后我们返回数据即可：

```typescript
return {
  ...state,
  hasMore,
  reset,
  getNextPage,
  deleteDataById
}
```

经过上面的折腾，完成了这个 `hook` 逻辑层的实现。

### 单元测试

单元测试基于 `react-hooks-testing-library` 实现，它可以帮助我们更方便的做测试。

#### 模拟数据库
```typescript
const createDatabase = () => {
  return (function () {
    // 模拟 85 条数据
    let data = Array(85)
      .fill({})
      .map((_el, index) => ({ id: index }))
    return {
      // 模拟分页取数据
      getData({ pageNumber, pageSize }: { pageNumber: number; pageSize: number }) {
        return {
          data: data.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
          total: data.length
        }
      },
      // 模拟删除某项数据
      deleteById(formId: number) {
        data = data.filter(({ id }) => id !== formId)
      }
    }
  })()
}
```
#### 模拟后端接口操作 model
```typescript
const createModel = function () {
  // 创建数据库操作
  const database = createDatabase()
  // 获取数据
  const fetchData = ({ pageNumber, pageSize }: { pageNumber: number; pageSize: number }) => {
    return new Promise<ReturnType<typeof database.getData>>(resolve => {
      setTimeout(() => {
        resolve(database.getData({ pageNumber, pageSize }))
      }, 1000)
    })
  }
  // 删除数据
  const deleteById = (id: number) => {
    return new Promise<null>(resolve => {
      setTimeout(() => {
        database.deleteById(id)
        resolve(null)
      }, 1000)
    })
  }

  return { fetchData, deleteById }
}
```
#### 功能测试
```typescript
import { act, renderHook } from 'react-hooks-testing-library'
import useLoadMoreList from '../src/index'

const config = { dataKey: 'data', idKey: 'id', pageSize: 10 }

const config = { dataKey: 'data', idKey: 'id', pageSize: 10 }

describe('use pagination', () => {
  it('case：hook 的数据获取，fetch data ', async () => {
    const model = createModel()
    const { result, waitForNextUpdate } = renderHook(() =>
      // tslint:disable-next-line: react-hooks-nesting
      useLoadMoreList(model.fetchData, config) // 
    )
    // 等待 rerender
    await waitForNextUpdate()
    // 判断数据是否符合预期
    expect(result.current.loading).toEqual(false)
    expect(result.current.total).toEqual(85)
    expect(result.current.data).not.toBeUndefined()
    expect(result.current.data).toHaveLength(10)
  })

  it('case：hook 获取下一页，fetch next page', async () => {
    const model = createModel()
    const { result, waitForNextUpdate } = renderHook(() =>
      // tslint:disable-next-line: react-hooks-nesting
      useLoadMoreList(model.fetchData, config)
    )
    // 防止前一个没有update
    setTimeout(async () => {
      act(() => {
        result.current.getNextPage()
      })

      await waitForNextUpdate()
      expect(result.current.data).toHaveLength(20)
    }, 2000)
  })

  it('case：hook 删除某项，delete one data', async () => {
    const model = createModel()
    const { result, waitForNextUpdate } = renderHook(() =>
      // tslint:disable-next-line: react-hooks-nesting
      useLoadMoreList(model.fetchData, config)
    )

    await waitForNextUpdate()
    await model.deleteById(1)
    act(() => {
      result.current.deleteDataById(1)
    })
    expect(result.current.data).toHaveLength(9)
  })
})

```

## 示例

在线`demo`：[https://fulldo.github.io/pages/use-load-more-list/](https://fulldo.github.io/pages/use-load-more-list/)

<img src="https://fulldo.github.io/pages/use-load-more-list/images/demo.gif" width="360" />

## 总结

至此，我们完成了这个无限加载更多数据的 hook 的实现，这里再总结下。

我们对项目分称了两层：
- 数据层，专注数据操作
- 逻辑层，专注逻辑实现

对于数据层，我们基于 `Flux` 数据流维护数据
- `state`，数据源
- `action`，通知 `reducer` 更改数据的动作
- `reducer`，最终变更数据的函数
  
对于逻辑层，我们做了这些工作：
- 初始化状态
- 定义数据操作，
  - 封装基础获取数据函数
  - 获取下页数据
  - 删除数据
  - 重置数据
- 数据返回

逻辑层核心点是获取数据函数的封装，然后还有对删除数据和获取下页数据的处理，删除处理是比较复杂的一点。

上面代码仓库：[https://github.com/fulldo/use-load-more-list](https://github.com/fulldo/use-load-more-list)

npm 主页：[https://www.npmjs.com/package/use-load-more-list](https://www.npmjs.com/package/use-load-more-list)

感觉大家阅读，也欢迎大家使用 `useLoadMoreList` ！
