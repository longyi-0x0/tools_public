# 线框实验室（wireframe-lab）

面向产品经理的结构化线框验证工具。画布不是像素图，页面是一棵可校验的 AST：布局决定怎么排，语义名决定长什么样，`use` 候选链决定由谁渲染，解析不到就退化成占位块加说明。

这个版本用来验证模型和手感，不是正式产品。它不接 AI、不做云同步、没有需求文档导出。

三层的东西：**项目**持有组件集与若干**页面**，页面是一棵可校验的 AST。示例项目只是首次打开的种子，顶栏随时能新建自己的项目。

## 能做什么

- 一种节点结构，没有类型字段。能不能装子节点、怎么排、由谁渲染，分别由 `slots`、`layout`、`use` 回答。
- 任何节点都能装子节点——按钮里放图标不再需要拿容器绕。
- 四种布局：横排、纵向、网格、自由。布局参数收在 `layoutProps` 里，加新布局不动顶层字段。
- 三种定位：跟随父布局流、锚点悬浮、自由容器里的绝对坐标。
- 尺寸：`fill` / `auto` / 像素 / 百分比，可带上下界与宽高比。
- 渲染来源是有序候选链，越靠前优先级越高；第一条命中的决定渲染。
- 语义名不带前缀（`button`、`navbar`），任何组件集提供同名实现就能覆盖内置的 `default` 集。
- 真组件内部可以用 `<WireSlot>` 开窗，把一块区域交还给线框渲染器，窗里照旧能拖、能切布局、能嵌套。
- 解析不到的候选不影响文档有效性，画成虚线占位块加角标。
- 编辑态与预览态切换；预览态里组件可以真实点击。
- 撤销/重做、本机自动保存、JSON 导入导出、旧文档自动迁移。
- 手机画布 390 px；桌面画布自适应工作区宽度。
- 项目层：本机多个项目，每个项目若干页面；页面可新建、复制、重命名、排序、删除；撤销栈按页面各记一份。
- 组件集上移到项目：一个项目的所有页面共用一套 `sets`，页面 JSON 不再自带。

## 怎么跑

工具是纯静态页，不经过打包器，也不依赖工具箱外壳的样式。

```bash
# 在 tools_public 仓库根目录
python -m http.server 5217 --directory tools/wireframe-lab/site
```

打开 <http://127.0.0.1:5217/>。

页面是免打包的原生 ESM，没有 JSX 编译，React 侧一律 `createElement`。React 18 UMD 放在 `site/vendor/`，运行时不访问 CDN。

发布走工具箱既有链路：本目录的 `tool.json` 声明为 `kind: "h5"`，只有 `site/` 会被发布。工具没有能力包依赖。

## 操作

| 动作 | 结果 |
| --- | --- |
| 点顶栏的项目名 | 打开项目菜单：上半部分是所有项目（当前那个打勾，点别的就切过去），下面是新建、重命名、导出整个项目、重建示例项目、删除项目 |
| 点左栏的页面条目 | 切到那一页；条目右侧的 ⋯ 里可以重命名、复制、上下移、删除 |
| 从左侧点一下条目 | 加入当前选中节点：有布局就装进去，声明了槽位就进第一个槽位，否则插在它后面 |
| 从左侧拖到画布 | 按落点插入到容器、槽位或自由坐标 |
| 拖动画布里的节点 | 换父节点、换同级顺序；靠近节点边缘时插到它前后 |
| 拖动自由容器里的节点 | 按 8 px 网格吸附；按住 Shift 临时关闭吸附 |
| 拖动悬浮元素 | 在原父节点内换锚点与 token 距离；跨容器需先取消悬浮 |
| 选中节点后按 Delete | 删除节点及子树，可撤销 |
| `⌘/Ctrl + Z` | 撤销 |
| `⌘/Ctrl + Shift + Z` / `⌘/Ctrl + Y` | 重做 |
| 顶栏「预览」或 Esc | 进入/退出预览态 |

选中节点后在右侧可以：切布局与参数、增删具名槽位、编辑候选链（加、删、上下移、给单条候选塞属性）、改语义属性、写说明、设尺寸、切定位。

切到自由布局时，当前直接子节点的画面位置会一次性物化为绝对坐标，所以画面不会跳；切回流式布局时删掉这些坐标，改由父节点与同级顺序重排。

## 项目与页面

页面是一页一个 JSON，结构照旧；**组件集不在页面上**，它在项目里：

```json
{
  "schemaVersion": 2,
  "id": "p-sample",
  "title": "商品列表",
  "root": "nRoot",
  "nodes": {
    "nBuy": {
      "id": "nBuy",
      "parent": "nCard",
      "pos": "a",
      "desc": "立即购买，点击后跳结算",
      "props": { "label": "购买" },
      "layout": "row",
      "layoutProps": { "gap": "sm", "align": "center" },
      "slots": ["leading", "trailing"],
      "size": { "height": 44, "minWidth": 88 },
      "position": { "mode": "flow" },
      "use": ["local:buy-button", "ios.button.filled", "button"]
    }
  }
}
```

项目是一层壳，把组件集和页面收在一起：

```json
{
  "schemaVersion": 1,
  "id": "pj-sample",
  "name": "好物铺示例",
  "description": "三张页面：列表、详情、购物车。",
  "sets": [{ "id": "default", "version": "1" }],
  "pages": [
    { "id": "pg-list", "title": "商品列表", "doc": { "schemaVersion": 2, "nodes": {} } }
  ],
  "createdAt": 0,
  "updatedAt": 0
}
```

页面的组件集就是项目那份 `sets`，解析时由宿主传进去（`resolveNode(registry, node, sets)`）。旧页面 JSON 里若还带着 `sets`，导入时会并进项目再从页面上删掉——页面带 `sets` 现在是结构层错误。

节点字段：

| 字段 | 说明 |
| --- | --- |
| `id` / `parent` / `pos` / `slot` | 扁平表加分数位置键；`slot` 表示落在父节点的哪个具名槽位 |
| `desc` | 给人读的说明，也给 AI 参考；占位块缺文字时用它 |
| `props` | 属性袋，原样透传给渲染函数 |
| `layout` / `layoutProps` | 省略即不排子节点；参数按布局类型收在 `layoutProps` |
| `slots` | 声明具名槽位；声明后子节点才能写进对应 `slot` |
| `size` | `width`/`height` 收 `fill`、`auto`、数字或百分比；另有四个上下界与 `aspect` |
| `position` | `flow`（默认）/ `anchor`（锚点 + token 距离）/ `absolute`（x/y/w/h） |
| `use` | 有序候选链，元素是字符串或 `{src, props}` |

### 候选链的文法

**串里含冒号就是句柄，不含就是 id。**

| 写法 | 含义 |
| --- | --- |
| `button`、`navbar`、`text.caption` | 语义名（可带变体），按项目 `sets` 的顺序在组件集里找 |
| `ios.button.filled` | 全限定 id，首段命中已安装集合时直接查那一个 |
| `local:buy-button` | 宿主注册表里的组件 |
| `file:../x.js`、`https://…` | 按路径或地址加载的模块，先预载再同步解析 |
| `npm:@acme/ui#Button` | 未实现，解析时明确报错并跳过这条候选 |

`default` 是内置集合，永远排在链尾，所以任何用户集合的同名实现都会覆盖它；在项目 `sets` 里写 `{ "id": "default", "enabled": false }` 可以把它移出解析链。全部候选都没解析到时，画占位块并显示第一个候选原文。

### 语义词表

`default` 集提供这些名字，第三方集合照着实现即可获得可移植性：

| 语义名 | 推荐属性 | 变体 | 槽位 |
| --- | --- | --- | --- |
| `text` | content | caption / body | — |
| `image` | alt | — | — |
| `button` | label、disabled | large / ghost | — |
| `input` | label、placeholder、value | — | — |
| `placeholder` | note | — | — |
| `navbar` | title | transparent | left、right |
| `tabs` | labels | — | content |

用了词表外的属性不会报错：照样透传，只是这条候选依赖具体实现，契约层给一条提示。

## 校验分两层

| 层 | 内容 | 失败后果 |
| --- | --- | --- |
| 结构层（页面） | id 唯一、parent 存在、`pos` 有效、无环、槽位存在、定位合法、不携带 `sets` | 报错，文档不可载入 |
| 结构层（项目） | 项目有名称与至少一页、页面 id 与文档 id 不重复、`sets` 声明合法 | 报错，项目不可载入 |
| 契约层 | 候选能否解析、属性是否落在语义词表里 | 告警，画面降级，文档照样可导出 |

文档有效性只由结构层决定。这是「渲染与数据分离」在校验器上的落点：同一份页面换一套组件集、换一个语言运行时都能打开。

## 渲染层

宿主先把语义算完，吐出一棵 IR（`ir/build-ir.js`）：token 换成像素、分数位置键排好序、锚点归一化成 `position`、候选链已经解析完。IR 是纯 JSON，能跨进程传。

语言适配器只做三件事：IR 到原生树的映射、各 scheme 的本地 loader、编辑态的命中与拖拽上报。React 侧的实现在 `render/`，`WireNode` 认 IR，`WireSlot` 负责开窗。

真组件的契约：

```js
export default {
  id: "buy-button",
  name: "购买按钮",
  honorsStructure: false,   // 是否承诺尊重 layout / slots / size
  slots: [],
  propsSchema: [{ key: "label", label: "文字", type: "string", default: "加购" }],
  defaultSize: { w: 104, h: 40 },
  Component: BuyButton,
};
```

`honorsStructure` 由目标自己声明，作者不写。内置 `default` 集全部为 `true`；真组件缺省 `false`，表示接管后自行决定内部。

## 测试

```bash
cd tools/wireframe-lab
node --test tests/*.test.mjs
```

覆盖：分数位置键、插入/移动/删除子树、自由布局物化与回退、槽位、结构层校验、契约层告警、候选链解析与降级、IR 确定性、v1→v2 迁移幂等、撤销快照往返、确定性序列化。

项目层另有两个文件：`project.test.mjs` 验项目与页面的增删改、组件集上移与项目校验；`workspace.test.mjs` 验旧单页草稿迁入项目、以及页面 / 项目两种 JSON 的判别与往返。

发布前从 `tools_public` 根目录跑：

```bash
node scripts/build-release.mjs
```

## 目录

```text
site/
├── index.html
├── styles.css
├── js/
│   ├── main.js
│   ├── core/          schema / ast / position / ops / validate / migrate / serialize / project
│   ├── resolve/       语义词表、组件集与本地组件注册表、scheme、候选链解析
│   ├── ir/            AST → IR，以及给 AI 用的意图描述
│   ├── render/        IR → DOM 的 React 渲染，含开窗组件
│   ├── editor/        app / dnd / outline / inspector / templates / workspace（项目与页面界面）
│   ├── components/    本地组件与注册表
│   ├── persistence.js 项目索引 / 项目正文 / 会话，以及旧单页草稿的迁移
│   ├── io.js          页面与项目两种 JSON 的判别与序列化
│   ├── sample.js
│   └── sample-project.js
└── vendor/            React / ReactDOM / LICENSE
tests/                 Node 单测
```

## 本机存了什么

| 键 | 内容 |
| --- | --- |
| `wireframe-lab:workspace:v1` | 项目索引：每个项目的 id / 名称 / 页数 / 更新时间，以及当前项目 |
| `wireframe-lab:project:<id>` | 一个项目一份：组件集与全部页面 |
| `wireframe-lab:session:v1` | 当前项目与页面、画布宽度、编辑/预览、每页记住的选中节点 |

项目层之前只有 `wireframe-lab:doc:v1` 一个键。首次打开新版本时那份草稿会被读出来，变成项目「我的草稿」，随后旧键删除。

## 当前边界

- 多页面但没有页面间跳转：节点上还没有「点了去哪一页」。
- 项目级操作（新建、删除、切页）不进撤销栈，也不能撤销。
- 组件集只在项目上，不能按页面覆盖。
- 无 AI 起稿或改稿，无 CRDT，无协作，无云同步。
- 组件只来自本地注册表与预载模块，不能现场编译用户粘贴的代码。
- 没有多选、复制粘贴、状态集、需求编号和 PRD 导出。
- 自由坐标吸附步长为 8 px，不能设置自定义步长。
- 只有 React 一套适配器；IR 是给其他语言留的接口，Flutter / Vue 尚未实现。
- `<WireSlot>` 是内部契约，还没有对外发布的兼容承诺。
- 移动端画布固定 390 px，桌面画布随工作区宽自适应。
