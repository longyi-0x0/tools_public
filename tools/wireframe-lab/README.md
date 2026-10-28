# 线框实验室（wireframe-lab）

面向产品经理的结构化线框验证工具。画布不是像素图，页面是一棵可校验的 AST：容器决定布局，叶子负责内容，叶子内部可以逐个接上真实 React 组件。

这个版本用来验证模型和手感，不是正式产品。它不接 AI、不做云同步、没有多页面与需求文档导出。

## 能做什么

- 三类节点：`container`、`pattern`、`leaf`。
- 四种容器布局：横排、纵向、网格、自由。
- 任意层级嵌套；拖拽改变父节点、同级顺序或自由坐标。
- 结构件只开放具名槽位：导航栏的左右槽位、标签页的内容槽位。
- 元素可以脱离父布局流，用「锚点 + token 距离」悬浮定位。
- 叶子可以在线框态与真实 React 组件之间切换，混合态是一等状态。
- 编辑态与预览态切换；预览态里组件可以真实点击。
- 撤销/重做、本机自动保存、JSON 导入导出。
- 手机画布 390 px；桌面画布自适应工作区宽度。

## 怎么跑

工具是纯静态页，不经过打包器，也不依赖工具箱外壳的样式。

```bash
# 在 tools_public 仓库根目录
python -m http.server 5217 --directory tools/wireframe-lab/site
```

打开 <http://127.0.0.1:5217/>。

发布走工具箱既有链路：本目录的 `tool.json` 声明为 `kind: "h5"`，只有 `site/` 会被发布。工具没有能力包依赖。

## 操作

| 动作 | 结果 |
| --- | --- |
| 从左侧点一下条目 | 加入当前选中的容器；选中的是元素时加在它后面 |
| 从左侧拖到画布 | 按落点插入到容器、槽位或自由坐标 |
| 拖动画布里的节点 | 换父容器、换同级顺序；靠近容器边缘时插到它前后 |
| 拖动自由容器里的节点 | 按 8 px 网格吸附；按住 Shift 临时关闭吸附 |
| 拖动悬浮元素 | 在原父容器内换锚点与 token 距离；跨容器需先取消悬浮 |
| 选中节点后按 Delete | 删除节点及子树，可撤销 |
| `⌘/Ctrl + Z` | 撤销 |
| `⌘/Ctrl + Shift + Z` / `⌘/Ctrl + Y` | 重做 |
| 顶栏「预览」或 Esc | 进入/退出预览态 |
| 右侧「渲染来源」 | 绑定或解绑真实组件 |

选中容器后可以切换布局。切到自由布局时，当前直接子节点的画面位置会一次性物化为 `frame`，所以画面不会跳；切回流式布局时删除这些 `frame`，改由 `parent + pos` 重排。

## 页面数据

一页一个 JSON：

```json
{
  "schemaVersion": 1,
  "id": "p-sample",
  "title": "商品列表",
  "root": "nRoot",
  "nodes": {
    "nBuy": {
      "id": "nBuy",
      "type": "leaf",
      "shape": "button",
      "label": "购买",
      "parent": "nCard",
      "pos": "a",
      "binding": { "component": "buy-button", "props": { "label": "购买" } }
    }
  }
}
```

- `nodes` 是扁平表，子节点用 `parent + pos` 定位与排序；插入和移动只改被移动的那个节点。
- Pattern 的子节点额外带 `slot`，槽位容量由结构件定义。
- `frame` 只出现在自由容器的直接子节点上；`escape` 用于任意父容器中的悬浮节点。
- 布局参数只有 `gap / align / distribute`；网格只支持等宽列，不支持跨行跨列。
- 序列化时固定 key 顺序，不写入任何运行时计算值。

校验器检查 id、父子关系、环、槽位容量、自由坐标和布局枚举。导入不会覆盖当前页面，除非整份文档通过校验。

## 本机存储

- 文档：`localStorage` 的 `wireframe-lab:doc:v1`。
- 会话态：`wireframe-lab:session:v1`，只存画布宽度、编辑模式和当前选中。
- 撤销历史只在当前页面会话里，不持久化。

换浏览器或清站点数据会丢本机草稿，要留档就用「导出 JSON」。

## React 组件

目前注册了两个组件：

| id | 用途 |
| --- | --- |
| `product-card` | 复杂商品卡，验证组件撑开布局、内部排版的边界 |
| `buy-button` | 带点击反馈的按钮，验证预览态的真实交互 |

注册表在 `site/js/components/registry.js`。组件只从本地表加载，不执行用户粘贴的代码。未注册的组件会回落到线框态，绑定信息仍保留。

React 18 UMD 放在 `site/vendor/`，运行时不访问 CDN；许可证同目录。

## 测试

```bash
cd tools/wireframe-lab
node --test tests/*.test.mjs
```

覆盖：分数位置键连续插入与顺序、插入/移动/删除子树语义、自由布局物化与回退、槽位容量、文档校验、撤销快照往返、确定性序列化。

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
│   ├── core/          ast / position / ops / validate / serialize
│   ├── editor/        app / dnd / outline / inspector / templates
│   ├── render/        AST → DOM 的布局渲染
│   ├── components/    注册表与两个真实 React 组件
│   ├── persistence.js
│   └── sample.js
└── vendor/            React / ReactDOM / LICENSE
tests/                 Node 单测
```

## 当前边界

- 单页面，无多页面导航。
- 无 AI 起稿或改稿，无 CRDT，无协作。
- 组件只来自本地注册表，不能上传或现场编译。
- 没有多选、复制粘贴、状态集、需求编号和 PRD 导出。
- 自由坐标吸附步长为 8 px，不能设置自定义步长。
- 移动端画布固定 390 px，桌面画布随工作区宽自适应。
