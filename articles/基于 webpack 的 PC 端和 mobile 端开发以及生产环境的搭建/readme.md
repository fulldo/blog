# 基于 webpack 的 PC 端和 mobile 端开发以及生产环境的搭建

Post in 2018-12-11.

我们用webpack做单页面应用开发应该尝试过很多次了，如果在同一个项目需要支持PC端和移动端，做成多页面应用，开发时能根据请求的终端返回不同的内容，应该怎么做呢？以下描述的是我尝试的一种方案，并且以`vue-cli 2.x`提供的模板为例，访问 [Github](https://github.com/fulldo/webpack-pc-mobile) 可查看本项目源码。

## 目录架构
因为是PC端和移动端两个模块，所以我们可以在`src`下拆分为`pc`和`mobile`两个目录，分别放两端的代码，再有一个`common`目录放置常量、数据层、api层等公共资源和可复用代码：
```

├── build
│ ├── webpack.config.base.js
│ ├── webpack.config.dev.js
│ └── webpack.config.prod.js
├── src
│   ├──common
│   │   ├── assets
│   │   ├── constants
│   │   ├── store
│   │   │  └── index.js
│   │   |── api
│   │   │  └── index.js
│   ├── pc
│   │   |── pages
│   │   │  |── Home.vue
│   │   │  └── About.vue
│   │   |── App.vue
│   │   |── index.html
│   │   └── main.js
│   ├── mobile
│   │   │  |── Home.vue
│   │   │  └── About.vue
│   │   |── App.vue
│   │   |── index.html
│   │   └── main.js
```

## webpack配置

因为有PC端和移动端，所有开发环境下应该有两个`entry`，分别为`src/pc/main.js`和`src/mobile/main.js`，参考`webpack`文档的多入口配置，所以我们在`webpack.config.base.js`可做如下修改：
```
  entry: {
    app: './src/pc/main.js',
    mobile: './src/mobile/main.js',
  },
```

完成以上修改后，我们分别对开发环境和打包环境作配置。

###  开发环境配置

在这里我们要做的是，可以让`webpack`既可以同时根据PC端和mobile端的模版生成对应的`html`并注入打包后的`js`文件，这个时候我们要借助`HtmlWebpackPlugin`这个插件帮我们实现。所以，在`webpack.config.dev.js`的`plugins`里面，我们作以下配置：
```
  plugins: [

    // ....

    // PC端
    new HtmlWebpackPlugin({
      filename: 'index.html', // 最后生成的文件名
      template: 'src/pc/index.html', // 模版html
      chunks: ['manifest', 'vendor', 'app'], // 注入打包后的js文件
      inject: true,
    }),
    // 移动端
    new HtmlWebpackPlugin({
      filename: 'index.mobile.html',
      template:'src/mobile/index.html',
      chunks: ['manifest', 'vendor', 'mobile'],
      inject: true,
    }),


    // ....
  ],
```

上面的配置要特别说明下的是`chunks`字段。webpack经过打包后一般会生成`vendor.js`,`manifest.js`,`app.js`。`vendor.js`一般是公共代码，`manifest.js`是与`webpack`加载代码有关的包。`app.js`一般是你写的业务代码，要注意的是，你配置了多少个入口文件，就会生成多少个这样的包，比如我们现在有两个入口文件，分别是`app`和`mobile`，那么就会生成`app.js`和`mobile.js`。

上面的配置了两个`HtmlWebpackPlugin`，分别代表PC端和移动端的模板，他们`chunks`字段也表明了在他们生成的html里分别注入`app.js`和`mobile.js`。

接下来我们想在开发时，想根据访问的客户端，决定加载的是PC端模版还是mobile端模板。比如在`chrome`浏览器直接打开时，我们就加载PC端模版`index.html`，如果我们打开了 `chrome devtools`，切换到移动端调试工具，那么刷新之后我们加载移动端的模版`index.mobile.html`，这个时候我们就可以借助`webpack-dev-server`工具了。

我们在webpack环境下开发，都会用到这个工具，无论是`vue`的脚手架`vue-cli`还是`react`的脚手架`create-react-app`都自带了这个工具。脚手架就是利用这个工具来启动本地服务的，其实`webpack-dev-server`内部使用了一个中间件叫做`webpack-dev-middleware`来启动web服务。

只要我们在`webpack`中配置`devServer`这个属性，就能使用了`webpack-dev-server`了。我们作如下配置（如果是`vue-cli`创建的项目，则在`config/index.js`里作相应配置）：
```
  devServer: {
    proxy: {
      '/': {
        target: 'http://localhost:8080', // 你项目的本地服务地址
        bypass: function(req, res, proxyOptions) {
          const userAgent = req.headers['user-agent'];
          if (req.headers.accept.indexOf('html') !== -1) {
            // 根据访问终端返回模板
            if (/mobile/i.test(userAgent) && !/iPad/i.test(userAgent)) {
              return '/index.mobile.html';
            }
            return '/index.html';
          }
        },
      },
    },
  }
```
这里我们代理了`/`的每个请求，如果用户的请求资源类型不是`html`，那么就然后根据用户的`user-agent`返回不同的模板。

这里要说一下的是`bypass`函数，官方文档介绍如下：
> [https://webpack.js.org/configuration/dev-server/#devserver-proxy](https://webpack.js.org/configuration/dev-server/#devserver-proxy)


> Sometimes you don't want to proxy everything. It is possible to `bypass` the proxy based on the return value of a function.

> In the function you get access to the request, response and proxy options. It must return either false or a path that will be served instead of continuing to proxy the request.

> E.g. for a browser request, you want to serve a HTML page, but for an API request you want to proxy it. 


这段文字的大意是，有时候对于浏览器的某些请求，你希望提供HTML页面，你可设置`bypass`函数，在函数里你可以拿到`req`，`res`和`proxy`的引用， 最后必须返回`false`或资源提供的路径，使这个请求不再继续代理请求。

经过上面配置之后，我们的开发就相对方便些了，只要我们在`chrome devtools`切换环境并刷新，webpack就会自动返回对应的模板。

注意：如果直接访问`http://localhost:8080`是无法按照客户端的`user-agent`返回任务东西的（不经过`bypass`函数），必须在后面加多一个路径才行，比如`http://localhost:8080/path`，这个问题有待解决。


### 生产环境配置

生产环境要配置的不多，只要配置`HtmlWebpackPlugin`就可以了
```
  plugins: [

    // ....

    // PC端模版
    new HtmlWebpackPlugin({
      filename: path.resolve(__dirname, '../dist/index.html'),
      template: 'src/pc/index.html',
      inject: true,
      minify: {
        removeComments: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
      },
      chunksSortMode: 'dependency',
      chunks: ['manifest', 'vendor', 'app'],
    }),
    // 移动端模版
    new HtmlWebpackPlugin({
      filename: path.resolve(__dirname, '../dist/mobile_index.html'),
      template: 'src/mobile/index.html',
      inject: true,
      minify: {
        removeComments: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
      },
      chunksSortMode: 'dependency',
      chunks: ['manifest', 'vendor', 'mobile'],
    }),
    // ....
  ],
```

经过配置就会生成文件了，但是有一个问题是，`vendor.js`会包含PC端和移动端的代码，可能有一些代码其中由一方是用不上的，比如`UI`框架，我的解决办法是在模版手动注入`vue/react`包和对应的`UI`框架，这种方法还有一个好处是减少`vendor`包的大小。。。

最后再贴一下项目 [github](https://github.com/fulldo/webpack-pc-mobile) 地址，欢迎star~