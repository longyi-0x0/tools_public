# QD8 · 问题域思考画板 · 技术方案设计（Vite + React + TypeScript 版）

> 状态：设计稿（任务 QD8，第 2 版：零构建约束已被用户决定覆盖）。只给方案，不含实现代码；文中代码块一律是**伪代码/配置片段**，不落实现。
> 落点：`src/tcb/toolbox_service/tools_public/tools/problem-domain-canvas/docs/design/06-tech-design.md`
> 字段来源：`docs/design/01-product.md`（下称「产品稿」）已存在，本文**全部字段名以它为准**：`entities[]` / `type`（8 类）/ `data` / `pos` / `edges[]`（15 类）/ `viewport.{overview,deps,model}` / `schemaVersion: 1`。

## 0. 文档定位与约定

### 0.1 本次变更：栈从"零构建"改为"独立前端工程 + 产物落 site/"

用户决定（Router 转达，覆盖原 brief 的第 2 条硬约束）：

- 源码用 **Vite + React + TypeScript** 开发，放在**独立前端目录**，构建产物（单页 `index.html` + `assets/`）落到本工具的 `site/`。
- 发布契约不变：**只有 `site/` 进产物**；`tool.json` 仍禁写 `id`/`version`；产物必须能被任意静态服务器直接打开（无 CDN、无后端、无运行时外链）。
- 源码目录位置**尚未拍板**；本文按"独立 package.json + 独立 vite config + `base: "./"` + outDir 指到 `site/`"设计，并把两种落法的差异写成 §1.1。

原方案里仍然成立的部分（本文保留并改写成 TS/React 口径）：坐标系与视口公式、分层布局伪代码、15 类边的形状语义、C1–C9 检查引擎接口与循环检测算法、持久化键与节流数值、导出三条路径、风险表。原方案里被推翻的部分：文件树（§1）、渲染选型前提（§2，现在"可引依赖，代价是体积与可控性"）、可测试性（§10，改 vitest）、以及新增的构建产物校验（§11）。

### 0.2 与产品稿的对齐（逐条可核对）

| 本文用的名字 | 产品稿出处 | 说明 |
| --- | --- | --- |
| 工作区 `workspace`（单个） | §5.1、§11 第 5 条 | `id/name/coreQuestion/background/goals/inScope/outOfScope/glossary/assumptions/entities/edges/viewport/createdAt/updatedAt` |
| 节点 `node` | §5.2 信封 | `id/type/title/order/pos/size/tags/flags{isPinned,isFolded}/data/createdAt/updatedAt` |
| 8 类节点 | §5.2–§5.4 | `question`（`data.kind` 三档 `core/sub/open`）+ 6 类领域元素（`actor/scene/concept/rule/event/example`）+ `note` |
| 边 `edge` | §5.5 | `id/type/source/target/label/order/createdAt`，**15 类**，A 组 5 / B 组 6 / C 组 4 |
| 5 视图 | §4.2、§6 | 问题总览 / 单问题详情 / 依赖与组合 / 领域元素 / 领域模型（顶栏 4 按钮，「领域」内含 2 段） |
| 9 条检查 `C1–C9` | §7 | 名称、判定、严重度、文案照抄；技术侧补接口、算法与 TS 类型 |
| 8 类输出物 `O1–O8` | §9 | markdown（O1/O6/O7）、json（O2）、svg（O3/O4/O5）、剪贴板（O8） |

技术侧相对产品稿**新增**、且不改产品 schema 的三样：

1. 备份键 `problem-domain-canvas:workspace:backup:v1`（写前留上一版，§6.2）。
2. 指纹 `meta.fingerprint`（只用于判断要不要重算，不导出、不入 schema）。
3. 吸附栅格常量 `GRID = 8`（不落盘，§3.4）。

产品稿已定的口径不改：单工作区（§11 第 5 条）、`schemaVersion` 缺失或 `>1` **拒绝载入**、检查每次编辑后**全量重算**、`pos` 只在问题总览手工摆放。

### 0.3 术语

- **文档状态（doc state）**：产品稿 JSON 的运行时镜像，必须可 `JSON.stringify`。
- **UI 状态**：选择、悬停、视口、面板滚动、忽略表——不进文档、不进导出。
- **产物**：`site/` 目录，发布脚本整份拷走（证据见 §1.5）。
- **确定性布局**：同一份数据永远算出同一张图（产品稿 §5.7，供导 SVG 与 diff）。

---

## 1. 文件与模块划分

### 1.1 源码目录位置（待拍板）：两种落法与差异

| | 落法 A：工具目录内 `tools/problem-domain-canvas/src-web/` | 落法 B：仓内独立前端目录（如 `web/problem-domain-canvas/`） |
| --- | --- | --- |
| `vite.config.ts` 的 `build.outDir` | `"../site"`（相对 config 文件） | 相对路径要跨多层（`../../src/tcb/toolbox_service/tools_public/tools/problem-domain-canvas/site`），或改用 `path.resolve(__dirname, ...)` |
| 与 `site/` 的距离 | 一层，改完马上 `vite build` 可见 | 多层，路径写错就写到别处，是"产物指错目录"风险的主要来源 |
| 发布扫描影响 | **不影响**：扁平形态（有 `tool.json`）下，构建脚本只挑 `VERSION` 命名的子目录判冲突，其余子目录被忽略；`node_modules/` 也不会被拷（只 `cp site`，见 §1.5） | 无影响（不在 `tools/` 下） |
| 仓库导航/工具链 | 与工具同处，一看就知道它是谁的源码；但 `tools_public/tools/**` 会被各种"扫工具目录"的脚本看到（含已提交的 `node_modules` 噪声） | 干净，但"工具目录里只有声明与产物"的原则被打散，新人容易只改 `site/` |
| 是否 monorepo 成员 | 两种落法都**不是**（本文假设）：独立 `package.json` + 独立 lockfile，装依赖在自己目录里 | 同左；若将来并入 workspace，只需加一行 `packages` 条目，不影响本文 |
| 推荐 | **推荐 A** | 备选 |

结论：本文按**独立包**写（独立 `package.json`、独立 `vite.config.ts`、独立 lockfile），`outDir` 用**相对 config 文件的路径**，并在 §11 加一条"产物必须含 `index.html` 且 `assets/` 相对引用"的硬校验——这样不管最终放哪，出错都能在发布前被命令抓到。

**不要**假设：能被上层 `pnpm -r build` 收编、能共享根 `tsconfig`、能用根 `node_modules`。以上任一成立都只是"顺手"，不能变成构建前提。

### 1.2 源码树（A 落法示例；`src-web/` 是占位名，随拍板改名）

```text
problem-domain-canvas/
├── tool.json                        # 工具声明；无 id、无 version（构建脚本强制，见 §1.5）
├── README.md                        # 可选说明，不发布
├── docs/design/                     # 不发布
│   ├── 01-product.md                # 产品稿（字段权威来源）
│   └── 06-tech-design.md            # 本文
├── src-web/                         # ← 源码；不进产物、不被发布脚本读取
│   ├── package.json                 # 独立包：scripts dev/build/test/typecheck；无 workspace 字段
│   ├── vite.config.ts               # base "./"、outDir "../site"、plugin-react、vitest 配置
│   ├── tsconfig.json                # strict、moduleResolution "bundler"、jsx "react-jsx"
│   ├── index.html                   # Vite 模板入口（构建后成为 site/index.html）
│   └── src/
│       ├── main.tsx                 # createRoot + <App/>；只在首帧做一次 store 初始化
│       ├── App.tsx                  # 三栏壳：顶栏 / 左栏 / 中栏(5 视图) / 右栏
│       ├── domain/                  # 纯 TS：无 React、无 DOM、无 localStorage
│       │   ├── types.ts             # 产品稿 §5 的全部 TS 类型（Workspace/Node/Edge/…）
│       │   ├── schema.ts            # 常量表：8 类 type、15 类边与三组、kind/status、默认尺寸、GRID
│       │   ├── factory.ts           # 建 workspace/node/edge、id 生成、深拷贝
│       │   ├── validate.ts          # 产品稿 I1–I8：validateWorkspace(ws) → Issue[]
│       │   ├── migrate.ts           # 迁移链 v1→vN 逐级单步；CURRENT_SCHEMA_VERSION = 1
│       │   ├── serialize.ts         # stableStringify + parseJson + 指纹
│       │   ├── layout/              # index/rank/order/place/model/tree（纯函数，§4）
│       │   ├── checks/              # index/index-build/graph-cycle/c-rules/term-normalize（§8）
│       │   └── export/              # markdown/json/svg/xml（纯字符串，§7）
│       ├── store/                   # zustand
│       │   ├── docStore.ts          # 文档状态 + 变更动作（唯一写入面）
│       │   ├── uiStore.ts           # 选择/悬停/视口/视图/折叠/忽略表
│       │   ├── historyStore.ts      # undo/redo 快照栈（≤100）
│       │   ├── commands.ts          # 命令层：每个动作 → 新 doc + 脏标记 + history 记录
│       │   ├── persistence.ts       # 300ms 节流、写前备份、storage 事件、只读降级
│       │   └── storage.ts           # Storage 适配器（真 localStorage / 内存假件）
│       ├── canvas/                  # 画布：渲染 + 交互
│       │   ├── CanvasView.tsx       # 缩放容器 + 节点层(DOM) + 边层(SVG)
│       │   ├── NodeCard.tsx         # 单节点卡片（memo，比较器见 §9.2）
│       │   ├── EdgeLayer.tsx        # 边层（memo，按 posEpoch 重建）
│       │   ├── edgePath.ts          # 纯函数：15 类边 → path d（§5.2）
│       │   ├── viewport.ts          # world↔screen、fit、裁剪判定（纯函数）
│       │   ├── usePanZoom.ts        # 滚轮/中键/空格拖，rAF 合帧
│       │   ├── useDragNode.ts       # 拖拽：本地 ghost 状态，松手才提交 doc
│       │   ├── useConnect.ts        # 拖出连线 + 端点合法性即时判定
│       │   └── measure.ts           # 文本折行缓存（Canvas2D measureText）
│       ├── views/                   # 5 个视图（overview/detail/deps/domain-elements/domain-model）
│       ├── panels/                  # TopBar/NavPanel/Inspector/ChecksPanel
│       └── util/                    # id/throttle/dom/escape
│       └── **/*.test.ts             # vitest 就近放置（§10）
└── site/                            # ← 构建产物；唯一进产物的目录（发布脚本 cp 的正是它）
    ├── index.html                   # Vite 产物（引用 ./assets/*）
    └── assets/
        ├── index-<hash>.js
        └── index-<hash>.css
```

依赖方向（**单向，违反即单测失败**）：

```text
util ← domain ← store ← canvas / panels / views ← App ← main
```

1. `domain/` **不许** import React、`store/`、`canvas/`、`panels/`、`views/`；只有 `domain/` 能被其它层随意引用（这是纯函数测试面）。
2. `store/` 只 import `domain/` 与 `util/`；`canvas/`、`panels/`、`views/` 只通过 store 的 selector/action 与外界交互，不互相 import。
3. 只有 `store/commands.ts` 与 `store/docStore.ts` 能改文档；组件只发命令、读状态。
4. `domain/export/` 只吃数据（含布局结果与折行缓存），不读 DOM、不读 CSS。

### 1.3 关键目录职责（一句话）

| 目录 | 一句话职责 |
| --- | --- |
| `domain/` | 产品稿 §5 数据模型 + 布局 + 检查 + 导出的纯逻辑，能在 Node 里跑。 |
| `store/` | 单一写入面：命令 → 新文档 → 脏标记 → 节流落盘；UI 状态与文档状态物理隔离。 |
| `canvas/` | 只有"把一份已布局好的数据画出来 + 把指针动作变成命令"两件事。 |
| `views/` | 5 种读法；只有 `overview` 吃 `pos`，其余都是确定性布局。 |
| `panels/` | 三块固定信息面：顶栏（工作区名/核心问题/视图/导出）、左栏（3 段导航）、右栏（属性 + 检查）。 |
| `site/` | 构建产物，**手改无效**（下次 build 覆盖），任何手改等同丢改动。 |

### 1.4 构建产物形态

```text
site/
├── index.html            # <script type="module" crossorigin src="./assets/index-<hash>.js">
└── assets/
    ├── index-<hash>.js   # React + app + zustand 全部打包（单 chunk 默认）
    └── index-<hash>.css
```

- `base: "./"` 保证所有引用是 `./assets/...` 相对路径（`base: "/"` 会让任意子路径部署与 `file://` 全部失效）。
- `build.sourcemap: false`（产物里不允许出现 `.map`，否则源码泄漏且体积翻倍）。
- `build.target: "es2020"`（现代浏览器；不做 IE）。
- 不拆 chunk（首屏单文件，少一次往返；`manualChunks` 等体积超预算再说，§9.1）。

### 1.5 发布边界（有据可查）

- `build-release.mjs:136-142`：扁平形态（目录里有 `tool.json`）下，只把 **`VERSION` 命名的子目录**判为冲突；其它子目录被忽略——所以 `src-web/` 放在工具目录**不会让发布失败**。
- `build-release.mjs:196-206`：h5 工具校验 `entry` 必须是 `site/` 下的相对路径、`site/` 必须存在、`site/<entry>` 必须存在，然后 `cp(site, stage/tools/<id>)`——**只有 `site/` 被拷**，`src-web/`、`node_modules/`、`docs/`、`tests/` 一概不进产物。
- `build-release.mjs:171-182`：`schemaVersion` 必须 2、`type` 必须 `tool`、出现 `id` 或 `version` 直接失败。
- 推论（写进 README/PR 模板）：**发布脚本不会跑 `vite build`**，它只拷 `site/`。所以 `site/` 必须是"已构建好且与源码同步"的状态——这条推论的后果见风险表第 1 条。

---

## 2. 渲染选型与状态方案（前提：可以引依赖）

### 2.1 候选

- **R1 React DOM 节点 + SVG 边层（自研画布）**：节点是 React 组件（`div`），边是一块 `<svg>`，两层共享一个带 `transform` 的父容器。
- **R2 react-konva / konva**：Canvas 2D 渲染，React 绑定。
- **R3 @xyflow/react（React Flow）**：现成的节点/边画布，自带 pan/zoom、handle、minimap。
- **R4 纯 SVG + React**：节点也是 `<g><rect><text>`。
- **R5 引图库算法**：elkjs / dagre / d3-hierarchy 做布局（与渲染正交，单独在 §2.2 依赖表里评）。

### 2.2 对比表（六维 + 体积/可控性）

| 维度 | R1 DOM + SVG | R2 react-konva | R3 xyflow | R4 纯 SVG |
| --- | --- | --- | --- | --- |
| 命中测试 | 免费：`event.target` + `closest('[data-id]')` | 自研：命中图形树、z 序、`stage.getPointerPosition()` | 内置 | 免费，空白命中需调 `pointer-events` |
| 文本换行与中文 | 免费：CSS 折行/`line-clamp`/避头尾 | 全自研：逐字 `measureText` + 手动断行 | 节点内容自己用 HTML 渲染（等同 R1） | 差：`<text>` 不折行，要手切 `<tspan>` |
| 可访问性 | 好：真元素、Tab、`aria` | 无：位图，需要隐藏 DOM 镜像 | 中：内置部分键盘交互，语义仍靠自定义节点 | 中：需给 `<g>` 补 role/tabindex |
| 缩放清晰度 | 清晰（CSS `scale` 重光栅化） | 需按 `dpr×zoom` 重设画布并重绘 | 清晰（transform） | 清晰 |
| 200 节点上限 | 800–1500 流畅 | 5000+（但开发成本高） | 与 R1 同量级，库自身开销 ~1 倍 | 500–1500（tspan 多则慢） |
| 体积（估算，gz） | React+DOM ≈ 52 kB | +konva ≈ +80 kB | +~48 kB（库）+ React | +0（仍要 React） |
| 可控性/契合度 | 完全可控；节点=富卡片，边=SVG 现成 | 文本/无障碍/导出三线全自研 | **节点模型与 `pos` 会和产品稿"文档即真相"打架**：库内部持有节点坐标，我们还要 `pos` + 3 套确定性布局，等于两份真相 | 折行与富内容成本高 |

**结论：R1。** 理由按权重：

1. **文档即真相**（产品稿 §5.7、§4.3）：`pos` 只在问题总览有效，依赖/模型视图每次确定性重算。xyflow 的 `nodes[].position` 是它的状态核心，我们若用它，就变成"库状态 + 产品 JSON"双真相，同步层是新增的 bug 面；R1 里坐标就是 `pos`，没有第二份。
2. **15 类边的形状语义**（§5.1）需要按 `type` 分派 path 生成器；自研 `edgePath.ts` 是 40 行纯函数且可单测，用库反而要绕过它默认的 bezier/step 行为。
3. **中文富卡片**：节点上要放 `code`、状态徽标、检查角标、多行标题——CSS 白拿；Canvas 方案要重建排版引擎。
4. **导出链**（§7.3）：从数据重算 SVG 与渲染层同构；Canvas 方案要 `toDataURL`，而产品稿 §9 明确禁止 DOM 截图。
5. **体积**：R1 = React + zustand ≈ 53 kB gz，比引 xyflow（≈100 kB 总量）小一半，且全部可控。

代价与对策：

- 两层坐标必须同源：**只有一个父容器带 `transform`**，节点层与边层都是它的子节点（§3.2，风险表第 2 条）。
- 边层 `svg { pointer-events: none }`，只有 `path` 开 `pointer-events: stroke`，否则边层吞掉节点点击（风险表第 8 条）。
- React 的重渲染要靠 memo + selector 控制，否则 200 节点拖一个会全量重渲（§9.2）。

### 2.3 依赖清单（版本 / 体积 / 不引它的替代方案）

| 依赖 | 版本 | 体积（估算，min+gz） | 不引它的替代方案 | 结论 |
| --- | --- | --- | --- | --- |
| `react` | 18.3.x | ≈ 7 kB | Preact（≈4 kB，但生态与 `@testing-library` 细节有坑） | 引 |
| `react-dom` | 18.3.x | ≈ 45 kB | 手写渲染层（等于自己写框架） | 引 |
| `zustand` | 4.5.x | ≈ 1.1 kB | `useReducer` + Context（粒度差，§2.4）/ 自研 60 行订阅 | 引 |
| `typescript` | 5.6.x | 0（dev） | JS + JSDoc（失去类型收益） | 引（dev） |
| `vite` | 5.4.x | 0（dev） | esbuild 手写脚本（要自己处理 CSS/HTML/`base`） | 引（dev） |
| `@vitejs/plugin-react` | 4.3.x | 0（dev） | 自写 esbuild JSX 转换 | 引（dev） |
| `vitest` | 2.1.x | 0（dev） | `node:test`（组件测试要自己搭 DOM 环境） | 引（dev） |
| `jsdom` | 25.x | 0（dev） | happy-dom（兼容性略差） | 引（dev） |
| `@testing-library/react` | 16.x | 0（dev） | 手写 `createRoot` + 断言（回归成本高） | 引（dev） |
| `@types/react` / `@types/react-dom` | 18.3.x | 0（dev） | — | 引（dev） |
| ~~`@xyflow/react`~~ | 12.x | ≈ 48 kB | §2.2 的 R1 | **不引**：双真相 + 定制成本 |
| ~~`konva` + `react-konva`~~ | 9.x | ≈ +80 kB | R1 | **不引**：文字/无障碍/导出/命中全自研 |
| ~~`elkjs`~~ | 0.9.x | ≈ 1.5 MB | 自家分层（§4.3，≈100 行） | **不引**：比整个应用大 20 倍 |
| ~~`dagre`~~ | 0.8.x | ≈ 30 kB | 同上 | **不引**：分层规则要按产品语义（`decomposesTo` 定层、A 组其余定序）改写，参数面不够 |
| ~~`d3-hierarchy`~~ | 3.x | ≈ 10 kB | 自家 `layout/tree.ts` | **不引**：只为一个缩进树 |
| ~~`immer`~~ | 10.x | ≈ 5 kB | 手写 path-copy（`updateNode(ws, id, patch)`） | **不引**：保持文档"显然 JSON 可序列化" |
| ~~`nanoid`~~ | 5.x | ≈ 0.5 kB | `crypto.randomUUID()` | **不引**：平台自带 |
| ~~UI 库 / Tailwind / 图标库~~ | — | — | 手写 CSS + 内联 SVG 图标 | **不引**：三栏深色布局自写更可控，且避免产物里出现未用的样式 |

体积预算（估算，未实测）：首屏 JS **≤ 200 kB gz**、CSS ≤ 30 kB gz、`site/` 总量 ≤ 1 MB（含字体？——不引字体，用系统字体栈）。

### 2.4 状态管理与文档模型

**选 zustand（三个 store，不是一个）。**

| store | 内容 | 是否落盘 | 变更频率 |
| --- | --- | --- | --- |
| `docStore` | **产品稿 JSON 原样**（`Workspace`）+ `dirty`/`rev` | 是（`workspace:v1`，300ms 节流） | 低（人操作级） |
| `uiStore` | `currentView`、`selection`、`hover`、`viewport.{overview,deps,model}`、`navFolded`、`inspectorScroll`、`ignoredChecks` | 仅 session 键（视口例外：按产品稿 §5.1 写在 workspace 里） | 中（选择/视口） |
| `historyStore` | undo/redo 快照栈（≤100 步，存 doc 引用） | 否 | 随命令 |

为什么 zustand：

1. **粒度**：`useStore(selector)` 只在选中切片变化时重渲。`useReducer` + Context 的默认行为是"Context 值一变，所有消费者重渲"——200 节点拖一个，全部 `NodeCard` 重渲，16ms 预算直接爆；要修就得拆多个 Context + 手动 memo，等于把 zustand 重写一遍还更脆。
2. **旁路 React**：拖拽/平移是高频率事件，用 `store.subscribe` + `ref` 直接改 DOM `transform`，**不进 React 提交**；zustand 原生支持（`subscribeWithSelector`），Context 做不到。
3. **体积**：1.1 kB 换掉上面两件事，划算。
4. 不用 `persist` 中间件直接落盘：我们需要迁移、写前备份、配额降级、只读模式、多标签检测，这些都得自己写；`persist` 的 `partialize/version/migrate` 钩子表达不了"备份 + 只读降级"。所以落盘走 `store/persistence.ts` 自己订阅 `docStore`。

**文档状态与 UI 状态分离的硬规则**：

- `docStore` 里的对象必须是产品稿 schema 的子集，**不含**函数、`Date`、`Map`、`Set`、类实例；`JSON.parse(JSON.stringify(doc))` 必须深等（单测守住）。
- `selection`、`viewport` 之外的 UI 状态**绝不**写进 doc（否则导出的 JSON 里出现 UI 垃圾，产品稿 O2 "整个 workspace 原样"就废了）。
- 视口是产品稿 §5.1 的 schema 字段（`viewport.{overview,deps,model}`），所以它**属于 doc**；但它变化不触发检查、不触发布局、不标 `dirty` 之外的重活（只标 dirty 以便保存）。

**更新方式**：命令式（`commands.ts`），每个命令返回新 `Workspace`（浅拷贝 + 沿路径拷贝 `entities` 数组与受影响节点）。不用 immer：文档结构浅（两级数组），手写 path-copy 约 30 行，换来"一眼看得出是纯 JSON"。

**撤销**：`historyStore` 存 `Workspace` 引用（结构共享，不会真拷 200 个节点）；每个命令 push 前一份。批量动作用 `transaction` 包起来（一次拖拽 = 一次 undo）。

---

## 3. 坐标系与视口

### 3.1 三套坐标

| 坐标 | 含义 | 谁持有 |
| --- | --- | --- |
| 世界 (wx, wy) | 文档坐标系；`node.pos` 直接存 | `entities[].pos` |
| 画布 (cx, cy) | 缩放容器内部 | `CanvasView` 的容器 div |
| 屏幕 (sx, sy) | 事件 `clientX/clientY` | 指针事件 |

### 3.2 变换公式

视口状态就是产品稿的 `viewport.overview = {x, y, zoom}`（`x/y` 即平移，单位屏幕像素）。缩放容器统一设：

```text
容器 style.transform = translate(<x>px, <y>px) scale(<zoom>)
容器 style.transformOrigin = "0 0"      # 必须显式，否则公式全错
```

**世界 → 屏幕**：

```text
sx = wx * zoom + x
sy = wy * zoom + y
```

**屏幕 → 世界**（指针落点、拖拽用）：

```text
wx = (sx - x) / zoom
wy = (sy - y) / zoom
```

**以屏幕点 p 为锚缩放**（滚轮/捏合必须"缩在指针下"）：

```text
k = zoom' / zoom
x' = px - (px - x) * k
y' = py - (py - y) * k
zoom' = clamp(zoom * k, ZOOM_MIN, ZOOM_MAX)
```

推导：锚点对应的世界点 `w = (p - xy)/zoom` 在变换后仍要落在 `p`，即 `p = w*zoom' + xy'`，代入即得。

注意点：

- `transform` 必须是 `translate` 再 `scale`（`translate(xy)·scale(z)`）；写成先 `scale` 后 `translate` 会让平移量被缩放，是这类工具头号事故。
- 边层 `<svg>` 尺寸固定为画布容器大小，内部坐标用**世界坐标**，靠父容器 `transform` 缩放：`path d` 永远是世界坐标，缩放平移不重算（React 下也意味着不重渲）。
- 每个视图各自持有 `viewport.{overview|deps|model}`（产品稿 §4.2、§5.1），切回原视图恢复原位；详情/领域元素视图不画布，不写 viewport。
- 视口变化通过 `store.subscribe` 直接写容器 `style.transform`（不进 React commit，见 §2.4/§9.2）；`zoom` 只在需要显示百分比时以低频状态同步。

### 3.3 输入映射

| 输入 | 判定 | 结果 |
| --- | --- | --- |
| 滚轮（无修饰键） | 平移 | `x -= deltaX; y -= deltaY`（shift 交换轴） |
| `ctrl`/`meta` + 滚轮、触控板捏合 | 缩放 | 以指针为锚，`k = exp(-deltaY * 0.0015)` |
| 空白拖 / 中键拖 / 空格+拖 | 平移 | `x += dx; y += dy` |
| 节点上左键拖 | 移节点 | 世界增量 `(dx/zoom, dy/zoom)` 加到 `pos`，**仅问题总览** |
| 双击空白 | 新建 | 在吸附后的世界点插入默认 `question`（`kind=sub`） |
| 节点 handle 拖出 | 连线 | 落点判定 + 15 类边选择器；非法端点即时拒绝（I4） |
| `0` / `F` | fit | `fitToContent()` |

### 3.4 位置存储与吸附

- `pos{x,y}` 是节点**左上角**世界坐标（产品稿 §5.2），整数像素；`size{w,h}` 只在改过尺寸时存，否则用 `schema.ts` 默认（`question` 260×130，其他 180×96）。
- `GRID = 8`：拖拽**过程中不吸附**（跟手），`pointerup` 时 `snap(v) = Math.round(v / 8) * 8` 再提交命令；按住 `alt` 临时关闭吸附。`GRID` 是代码常量，不落盘（不改产品 schema）。
- `flags.isPinned = true` 的节点在确定性布局里不被移动；`pos` 缺失时按类型网格落位，不报错（产品稿 §5.2）。
- 写入前 `Number.isFinite` 兜底：`NaN` 会顺着布局与导出传染，按 0 处理并记 warning。

### 3.5 缩放范围与适配

- `ZOOM_MIN = 0.25`、`ZOOM_MAX = 2.5`、默认 1（产品稿 `viewport` 缺省 `{x:0,y:0,zoom:1}`）。
- 按钮步进 `×1.2 / ÷1.2`，以画布中心为锚。
- `fitToContent(padding = 48)`：

```text
# 伪代码
function fit(nodes, viewport, canvasW, canvasH):
  if nodes 为空: return {x:0, y:0, zoom:1}
  bbox = 所有节点 [pos.x, pos.y, pos.x+w, pos.y+h] 的并集
  vw = canvasW - 2*padding; vh = canvasH - 2*padding
  zoom = clamp(min(vw/bbox.w, vh/bbox.h), ZOOM_MIN, ZOOM_MAX)   # 宽或高为 0 时跳过该项
  if !isFinite(zoom) or zoom <= 0: zoom = 1                    # 单点/退化
  x = padding + (vw - bbox.w*zoom)/2 - bbox.x*zoom
  y = padding + (vh - bbox.h*zoom)/2 - bbox.y*zoom
  assert bbox 中心经 world→screen 落在画布矩形内               # 防公式写反
  return {x, y, zoom}
```

- 调用时机：首帧、切回视图（无历史 viewport 时）、导入后、点"适配"；**不**在每次拖动后自动 fit。
- 依赖/模型视图的 fit 用布局结果 bbox，不用 `pos`。

---

## 4. 布局算法

### 4.1 四种布局，各管一段

| 布局 | 用在哪 | 输入 | 是否写回 `pos` |
| --- | --- | --- | --- |
| `overview` | 问题总览 | 已有 `pos`（缺则网格落位） | 是（人手拖动） |
| `deps` | 依赖与组合视图、O4 依赖图 SVG | 问题节点 + A 组 5 类边 | 否 |
| `model` | 领域模型视图、O5 模型 SVG | 领域元素 + C 组 4 类边 + 淡色来源问题 | 否 |
| `tree` | 左栏树序、O3 问题树 SVG | 问题节点 + `decomposesTo` | 否 |

产品稿硬要求：`deps` 与 `model` 必须**确定性**（同数据同结果），不覆盖 `pos`，`isPinned` 在这两个视图被忽略。下面重点写 `deps`（最复杂）；`model` 是"概念为心、规则贴概念、场景连参与者、来源问题外圈淡色"的同心布局，复用同一套 `place` 函数，伪代码不重复。

### 4.2 deps 布局策略（Sugiyama 裁剪版）

1. **定层**：只在 `decomposesTo` 上从"无入边的问题"做 BFS；`dependsOn/sharesState/conflictsWith/alternativeOf` **不参与分层**（产品稿 §6："`decomposesTo` 决定层，`dependsOn` 决定同层内顺序"，后者由重心法落地）。
2. **同层顺序**：相邻层 4 轮重心法（>600 节点降为 2 轮），比较键 `(重心, order, code 自然序, id)`——`P1.2 < P1.10` 的自然序必须手写（产品稿 §5.7），不能用字符串比较。
3. **落坐标**：层基线纵向叠加、同层横向排开，父向子群体中心靠拢一轮，最后平移到原点附近并吸附。
4. **环不是异常**：C4 命中时产品稿 §6 要求"依赖视图退回网格布局并示意"，所以布局函数**必须接受环**（不抛错、不死循环），由视图层决定降级；降级形态是"网格 + 环上边高亮"。

### 4.3 伪代码（≤100 行，**伪代码**）

```text
# 伪代码：layoutDeps(ws) → { id: {x, y} } | null，不修改 ws，不写 pos
CONST GAP_X = 40, GAP_Y = 96, MAX_ORDER_ITER = 4

function layoutDeps(ws):
  Q   = ws.entities.filter(n => n.type === "question")
  DEC = ws.edges.filter(e => e.type === "decomposesTo"
        && byId[e.source]?.type === "question" && byId[e.target]?.type === "question")
  kids, pars = {}, {}
  for e in DEC:
    if e.source === e.target: continue                     # 自环不进分层（I4 本应拦）
    kids[e.source].push(e.target); pars[e.target].push(e.source)

  roots = Q.filter(q => 空(pars[q.id])).map(q => q.id)
  if roots 空: roots = [Q 里 order 最小的那个 id]           # 全环兜底（C4 场景）
  rank = {}                                                # id → 层号
  queue = roots.map(r => [r, 0]); head = 0
  while head < queue.length:                               # 游标队列，避免 O(n²)
    [u, d] = queue[head]; head += 1
    if u in rank and rank[u] <= d: continue                 # 已用更浅层到达 → 跳过（环安全）
    rank[u] = d
    for v in (kids[u] ?? []):
      if !(v in rank) || rank[v] > d + 1: queue.push([v, d + 1])

  for q in Q: if !(q.id in rank): rank[q.id] = maxRank(rank) + 1   # 不可达：单独层

  layers = groupBy(rank)                                   # 层号 → [id]
  for L of 层号升序: layers[L].sort(by(order, codeNatural))        # 稳定初序（确定性）

  iters = Q.length > 600 ? 2 : MAX_ORDER_ITER              # 固定轮数：不做到不动点
  for iter in 1..iters:
    for L of 层号升序，跳过第一层:
      prevPos = indexMap(layers[L - 1])
      layers[L].sort(by(
        mean(prevPos[p] for p in (pars[n] ?? [])) ?? Infinity,
        order, codeNatural))

  y = 0; yOf = {}
  for L of 层号升序: yOf[L] = y; y += layerHeight(L) + GAP_Y

  place = {}; xMax = 0
  for L of 层号升序:
    x = 0
    for n of layers[L]:
      place[n] = { x, y: yOf[L] }; x += widthOf(n) + GAP_X
    xMax = max(xMax, x)

  for p of 有 kids 的问题:                                  # 一轮父居中，减少正交拐弯
    cx = mean(kids[p].map(c => place[c].x + widthOf(c) / 2))
    place[p].x = clamp(cx - widthOf(p) / 2, 0, layerWidth(rank[p]) - widthOf(p))

  minX = min(place.x); minY = min(place.y)                 # 平移到原点附近
  for n of keys(place):
    place[n].x = snap(place[n].x - minX, GRID)
    place[n].y = snap(place[n].y - minY, GRID)

  if 任一坐标非有限: return null                            # 调用方降级网格（对应 C4 视图要求）
  return place
```

`layerHeight(L) = max(heightOf(n))`；`widthOf/heightOf` 优先用 `size`，否则用产品稿 §5.2 的类型默认值。

### 4.4 为什么不用 elkjs / dagre / d3-hierarchy

- **elkjs**：≈1.5 MB，比整个应用大 20 倍；它的 layered 算法参数面（端口、方向、层间距）远超我们需要的"`decomposesTo` 定层 + 小组内定序"。
- **dagre**：支持分层，但把"同层顺序"交给它的交叉最小化，我们恰恰需要"`order`/`code` 自然序"作为第一优先（产品稿 §5.7 的树序与画布顺序要对得上），定制反而更多；30 kB 换 100 行伪代码不划算。
- **d3-hierarchy**：只服务缩进树（左栏 + O3），我们已有 `tree.ts` 的 20 行递归；为一个树引一个库不值。
- 保留自行实现的另一个理由：**环安全**是我们的产品要求（C4 时降级），第三方库遇环多半抛错或给不可解释的图。

### 4.5 环与死循环（三处闸）

1. 分层 BFS"层号不下降就跳过"：环上任一边最多把节点推到更浅层，入队上界 `O(V+E)`。
2. 重心法**固定轮数**，不判断收敛，因此没有"永不收敛"分支。
3. `try/catch` + 有限性断言：异常或 `NaN` 返回 `null`，视图退回网格（正好对上 C4 的产品要求），绝不让画布空掉。
4. 自环分层前剔除、平行边只取一条参与分层；真实环路径交给 `checks/graph-cycle.ts`（§8.4）。

### 4.6 何时重排 / 何时不动

- 问题总览：新增节点落在点击处，删除不动别人，**从不**自动重排（`pos` 是人手的）。
- 依赖/模型视图：进入视图、结构指纹变化、切换方向时重排；纯视口变化不重排；布局结果用 `useMemo([fingerprint, direction])` 缓存。
- 只有 overview 的坐标会写回 `pos`（走命令，可撤销）；deps/model 的结果只存在于内存与导出参数。

---

## 5. 连线渲染

### 5.1 15 类边 → 形状（语义决定形状）

| 边 type | 组 | 形状 | 视觉 |
| --- | --- | --- | --- |
| `decomposesTo` | A | **正交折线**（父底中点 → 竖直 → 水平 → 竖直 → 子顶中点） | 实线 1.5px、直角、实心三角箭头 |
| `dependsOn` | A | **直线**（边界点 → 边界点） | 实线 1.2px、开口 V 箭头 |
| `sharesState` | A | 直线 + 中点短竖杠 | 1.2px |
| `conflictsWith` | A | **贝塞尔曲线** + 虚线 | 暖色、`5 4` 虚线、双头 |
| `alternativeOf` | A | 直线 + `2 3` 交替虚线（"备选"） | 1.2px |
| B 组 6 类 | B | 短直线（问题 → 领域元素） | 1px 细线，颜色按目标元素类型，label 用产品稿"画布文字" |
| C 组 4 类 | C | 直线（对称边合并为一条、无箭头） | 1px，只在模型视图画 |

为什么这样分（对得上产品稿 §5.5 的两条写死解释）：

- 正交线读起来"像结构"，天然表达分解，同层横排时拐点最少。
- 直线最短最不抢眼：`dependsOn` 数量最多，曲线多了会糊。
- 曲线 + 虚线让冲突从满屏直线里跳出来；冲突数量少，交叉代价可接受。
- B 组是"问题指向领域元素"的挂靠，细线 + 目标类型颜色，不与问题间连线抢层级。

### 5.2 路径生成（纯函数，`domain`/`canvas` 共用）

```text
# 伪代码
function pathOf(edge, a, b, index):
  if edge.type === "decomposesTo":
    x1 = a.x + a.w/2; y1 = a.y + a.h; x2 = b.x + b.w/2; y2 = b.y
    if y2 < y1: return 三段折线(a 右侧 → 竖直 → b 底部)     # 子被拖到父上方
    ym = (y1 + y2) / 2
    return `M ${x1} ${y1} L ${x1} ${ym} L ${x2} ${ym} L ${x2} ${y2}`
  if 直线组(A 组其余, B 组, C 组):
    p1 = boundaryPoint(a, center(b)); p2 = boundaryPoint(b, center(a))
    return `M ${p1} L ${p2}`
  if edge.type === "conflictsWith":
    p1 = boundaryPoint(a, center(b)); p2 = boundaryPoint(b, center(a))
    off = index === 0 ? 0 : (index % 2 ? 1 : -1) * ceil(index/2) * 24
    c1 = lerp(p1, p2, 0.33) + normal(p1, p2) * off
    c2 = lerp(p1, p2, 0.66) + normal(p1, p2) * off
    return `M ${p1} C ${c1} ${c2} ${p2}`
```

`boundaryPoint(node, toward)`：从节点中心向 `toward` 做射线-矩形求交（四边取最小正 t），避免线头插进卡片。

### 5.3 边标签避让

标签是 `edge.label`（≤12 字）或产品稿 §5.5 的缺省"画布文字"，短且不折行。

- 候选位置依次尝试，取第一个"不与任何节点 AABB 相交、不与已放置标签相交"的：① 中点法向 −10；② 中点法向 +10；③ `t=0.3`；④ `t=0.7`。
- 全失败回落到中点 −10，并加白色描边底（`paint-order: stroke`）。
- 标签 `pointer-events: none`；命中由 `path` 负责，命中宽度放宽到 12px（视觉仍 1.5px）。
- 已放置标签只维护矩形列表（一般 < 50），`O(n²)` 足够。

### 5.4 自环与平行边

- **自环**：I4 禁止（产品稿 §5.8），`validate` 与 `useConnect` 双重拦截；导入数据若带自环，渲染成节点右上角小圆弧并置灰 + 进 `warnings`。
- **对称边**：`sharesState`/`conflictsWith`/`alternativeOf`/`conceptRelated` 只存一条，方向按 I6 规范化（`source = 两端 id 字典序较小者`），渲染双头箭头。
- **平行边**（同 A→B 不同 type）：`index` 递增偏移，第 2 条起 `±16px`；同 type 同端点由 I5 拦（丢后到的重复边）。
- 箭头：`<defs>` 内 3 个 marker（实心三角/开口 V/双头），`markerUnits="strokeWidth"`；id 带 `pdc-` 前缀，导出时重建（§7.3）。

---

## 6. 持久化与并发

范式照抄 `wireframe-lab/site/js/persistence.js`：命名空间前缀 + 版本号 + `load*/save*/persist*` 分工 + "读不出来就丢、不半打开"。React 化后只多一件事：落盘由 `persistence.ts` 订阅 `docStore` 触发，**不在组件里写**。

### 6.1 键设计

| 键 | 内容 | 谁写 | 备注 |
| --- | --- | --- | --- |
| `problem-domain-canvas:workspace:v1` | **整个 workspace 原样**（产品稿 §5.1、验收 E2） | `persistence.flush()` | 主键；MVP 唯一真相 |
| `problem-domain-canvas:workspace:backup:v1` | 上一版 workspace | `flush` 写前覆盖 | 技术新增（§0.2），配额不足时可回收 |
| `problem-domain-canvas:session:v1` | `{currentView, navFolded[], inspectorScroll, ignoredChecks[]}` | `persistence.saveSession` | 易失态；写失败静默 |
| `problem-domain-canvas:index:v1` | `{schemaVersion, workspaces:[{id,name,updatedAt}], currentWorkspaceId}` | `persistence.saveIndex` | **MVP 只写不读**（产品稿 §11 第 5 条留位） |

- 前缀与目录名一致；所有键集中在 `storage.ts` 顶部常量，禁止别处拼字符串。
- `viewport` 是 workspace 的 schema 字段（产品稿 §5.1），**不进 session**。
- 多工作区键位 `workspace:<wsId>` 在 v2 启用；`v1_to_v2` 已预留（§6.4）。

### 6.2 写入节流（数值定死）

| 触发 | 延迟 | 说明 |
| --- | --- | --- |
| doc 变化（增删改、拖拽结束、状态推进、viewport 变化） | **debounce 300ms** | 与产品稿 §4.2 的"字段 300ms 防抖写回"同一节拍 |
| 拖拽/输入过程中 | 不落盘 | 只改内存与 DOM |
| 长事务兜底（连续操作不停手） | **maxWait 2000ms** | 距上次落盘 ≥2s 强制写一次 |
| `visibilitychange → hidden`、`pagehide`、`beforeunload` | 立即 flush | 关页前的最后一道闸 |
| 抛 `QuotaExceededError` | 立即回收 + 重试 1 次 | 回收顺序：backup → session；仍失败进只读降级（§6.6） |

一次 flush 的顺序（**先备份再覆盖**）：

```text
# 伪代码
function flush():
  if !dirty: return
  text = stableStringify(ws)                        # 键排序：便于 diff 与"内容是否变化"判断
  if text === lastWrittenText: dirty = false; return
  if sizeOf(text) > 4MB: 进只读降级 + 提示导出       # 单域上限约 5MB
  prev = storage.get(KEY)
  if prev: storage.set(BACKUP_KEY, prev)            # ① 备份旧版
  storage.set(KEY, text)                            # ② 覆盖正文（单键原子）
  lastWrittenText = text; dirty = false
```

关键点：**正文整份写、单键写**。localStorage 无事务，但单键 `setItem` 原子；分片写会留下"写了一半"的中间态。

### 6.3 多标签页冲突检测

产品稿 N4 口径是"两窗口同时改以后写覆盖为已知行为，不弹冲突解决"——**遵守**，技术上只做"不静默丢数据"的最小防护：

| 场景 | 检测 | 处理 |
| --- | --- | --- |
| 另一标签改了主键 | `window.storage` 事件，`key === KEY` 且 `newValue !== lastWrittenText` | 不弹框（N4）。本地不脏 → 静默热载（保留 viewport），提示条"已同步另一个窗口的改动"；本地脏 → 继续写（后写覆盖），但先把对方版本写进 `backup:v1`，提示条"另一个窗口的改动已存为备份" |
| 另一标签删了键 | `storage` 事件 `newValue === null` | 保持内存不动，提示"存储已被清空，刷新将回到空工作区"，给"立即重新保存"按钮 |
| 另一标签改 session | `key === SESSION_KEY` | 只刷新折叠态，不动画布 |
| 同标签 undo 后落盘 | 本地 dirty | 直接写，不比较 |

- `storage` 事件只跨标签触发，不会自激；比较用字符串全等而非深比较（便宜够用）。
- 不做三路合并：图文档合并成本远高于收益，产品稿也不要求。

### 6.4 迁移链（v1 → vN）

```text
decode(text)
  → JSON.parse（失败：中文提示"文件不是合法 JSON"，原文留在内存供"查看原文"）
  → 版本判定：
       schemaVersion === CURRENT(1)  → 直接用
       schemaVersion 缺失            → 拒绝载入（产品稿 §5.1、A2/E3）
       schemaVersion < CURRENT       → 逐级单步迁移
       schemaVersion > CURRENT       → 拒绝载入（不降级写，防写坏）
  → validateWorkspace（I1–I8）
  → 补默认值（pos/size/flags/data 缺省）
```

- `MIGRATIONS = { 1: v1_to_v2 }`，**只写相邻两级**；`while (v < CURRENT) { ws = MIGRATIONS[v](ws); v++ }`。不允许跨级函数（跨级一多就成笛卡尔积）。
- 每个 `vN_to_vN+1`：纯函数、先深拷贝、不读 localStorage、不抛业务异常（坏字段降级丢弃 + `warnings[]`）。
- 迁移只发生在**读**路径（载入、导入、session 恢复）；写路径永远写当前版本。
- 必须幂等：`migrate(migrate(x))` 与 `migrate(x)` 深等（单测守住）。
- 今天 `CURRENT = 1`，链是空实现；预留两步：`v1_to_v2`（多工作区：主键 → `workspace:<id>` + `index:v1`）、`v2_to_v3`（`note.anchorId` 单锚点 → `anchors[]`）。函数先写"识别 + 抛未实现"，**不要**现在编造字段。
- TS 类型配合：`type WorkspaceV1 = …; type Workspace = WorkspaceV1`，迁移函数签名 `(raw: unknown) => Workspace`，`unknown` 起步，避免"类型断言掩盖坏数据"。

### 6.5 导入外部 JSON 的校验与降级

导入是唯一"外人能塞任意数据"的入口，四道闸：

1. **大小闸**：`text.length > 8MB` 拒绝，回报实际大小。
2. **形态闸**：解析后有 `entities` 且 `edges` 为数组才算 workspace；否则拒绝（本工具没有"单页 doc"形态，不做猜测）。
3. **结构闸**：跑 `validateWorkspace` 收集**全部**错误，分三级：
   - **致命**（`entities` 非数组、id 重复到无法修复）→ 拒绝，**不改动现有数据**；
   - **可修**（`pos` 缺失、`type` 未知、`data` 非对象、悬空边、非法端点组合、重复边、对称边未规范化）→ 按 I2–I6 修：`pos` 缺失走网格落位；未知 `type` 降级只读灰框；悬空边丢弃；非法端点的边丢 `type` 保留 `label` 并标只读；重复边丢后到的；对称边静默纠正方向。每条进 `warnings`（产品稿 A3 要求"该边被丢弃并提示，其余数据完整"）；
   - **可忽略**（未知字段）→ 丢弃并记 warning。
4. **落地闸**：替换当前工作区**前**先做三件事——把当前工作区写进 `backup:v1`、在内存留"导入前快照"、顶部给"撤销导入"按钮（一步恢复）。产品稿只要求 A2/A3 不丢原数据，这是按"最易毁数据"补的一道。
- `id` 冲突（与本机 `ws.id` 同名）**不重写 id**，提示"已有同名工作区"，由撤销/覆盖二选一（单工作区 MVP，不做别名链，与产品稿 §5.7"不写别名到数据里"一致）。

### 6.6 配额与降级

- 触发：`setItem` 抛 `QuotaExceededError`，或序列化后 > 4MB。
- 顺序：① 删 backup 重试；② 删 session 重试；③ 仍失败 → **只读模式**：顶部红条"本机存储已满，已停止自动保存"，禁用编辑命令，但保留"导出 JSON"（导出不写 localStorage）。
- 只读模式下不再尝试写（避免每次操作抛异常打断交互）；退出条件：用户清理后刷新并写入成功。
- 启动时若可用则请求一次 `navigator.storage.persist()`（照 `persistence.js:196-201`），失败静默。
- 读兜底链：主键 → `backup:v1` → 空工作区（含示例种子）。产品稿 E2 要求"清掉主键刷新 → 空工作区，无报错"，因此**空工作区必须是合法状态**。

---

## 7. 导出

8 类输出物（产品稿 §9）：markdown 三种（O1/O6/O7）、json 一种（O2）、svg 三种（O3/O4/O5）、剪贴板一种（O8）。共同原则：**导出物由纯函数从 workspace 生成字符串，不依赖 DOM 截图**。

### 7.1 Markdown（O1 / O6 / O7）

- 一个生成器 `docToMarkdown(ws, {scope})`，`scope ∈ "all" | "oneQuestion" | "checkReport"`，三种输出共用段落渲染函数，避免三份格式漂移。TS 用联合类型 + `never` 兜底，漏分支编译期就报。
- O1：`# 工作区名` → 核心问题 → **树序**问题列表（`code`、标题、陈述、状态、`kind`、判定标准条数、缺失项）→ 领域元素按 6 类分组 → 术语表 → 检查结果摘要。树序按产品稿 §5.7（`decomposesTo` 深度优先，同层 `order` 升序、`code` 自然序）。
- C1 阻断条目在 O1 标「未通过」并列缺失项（产品稿 F2）——生成器读 `runChecks` 结果，不自己再判。
- O7 只输出单问题 16 个 `data` 字段 + 关系清单 + 正反例；O6 只输出 9 条检查命中（编号/名称/严重度/涉及节点/定位）。
- 转义：表格单元格 `|` → `\|`、换行 → `<br>`；标题行不折行；末尾单个 `\n`（与 `io.js:12-14` 同约定）。
- 文件名字符替换 + 重名加 `YYYYMMDD-HHmm`（产品稿 §9 三条实现约束）。

### 7.2 JSON（O2）

- `stableStringify(ws)`：键排序 + 2 空格 + 末尾 `\n`，同一工作区导出两次字节一致（可 diff、可进 git）。
- 原样导出（含 `schemaVersion`），不裁剪、不迁移——备份语义是"就是我本机这份"。
- 下载：`Blob` → `URL.createObjectURL` → `<a download>` → `setTimeout(revokeObjectURL, 1000)`（立刻 revoke 在 Safari 会取消下载）。照 `io.js:55-60`。

### 7.3 SVG（O3 / O4 / O5）

**核心判断：不从画布 DOM 序列化，而是用同一套 `domain/layout` 纯函数重算坐标 + 同一份折行缓存生成字符串。**

产品稿 §9 明确"不读画布 DOM"；React 下更应如此：`XMLSerializer` 序列化现有 DOM 会带进类名、`data-*`、选中态、React 的 `__reactFiber` 属性残留与浏览器加的属性，导出的 SVG 在 Illustrator/Figma/其它浏览器里表现不可控。重算成本极低（布局是纯函数、确定性），结果还能快照测试。

关键 API 与写法：

1. **尺寸**：`width/height` 取布局 bbox + `2*padding`，同时写 `viewBox="minX minY w h"`；两者同源，否则外部工具裁切。
2. **命名空间**：根 `<svg xmlns="http://www.w3.org/2000/svg">` 必写，否则当 `<img>` 打开空白。
3. **样式内联**：根下放一段 `<style>`（`<![CDATA[ … ]]>` 包裹），只写类选择器；几何属性直接写在元素上。禁止 `@import` 与外部 `<link>`。
4. **文本**：调用方传入 `measure.ts` 的折行缓存（与画布一致），逐行 `<text><tspan x dy>`。这是唯一允许的"DOM 派生输入"，且只含字符串与数值。
5. **字体**：安全栈 `-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`。已知坑：目标机器缺字体 → 文字变宽溢出方框；缓解是折行按 `width * 0.9` 留 10% 余量 + 导出旁提示"SVG 内文字可编辑，缺字体请替换"。不做文字转路径（无依赖下做不到）。
6. **箭头**：`<defs>` 内 3 个 marker，id 带 `pdc-` 前缀，生成器每次重建；多边复用。
7. **`foreignObject`**：**不用**（Illustrator、老 Inkscape、多数 PDF 转换器不支持或渲染错乱）。
8. **背景**：默认透明；白底选项 = `viewBox` 大小的 `<rect fill="#fff">` 作为第一层。
9. **剥离交互**：生成器只吃数据，天然没有 `data-*`/`cursor`/选中描边（产品稿 §9 的 `stripInteractions()` 因此变成"不生成"，比事后剥离可靠）。
10. **自检**：导出后可在新标签打开 `blob:` URL（`URL.createObjectURL(new Blob([svg], {type:"image/svg+xml"}))`）。

**若将来确实要"所见即所得导出当前画布"**（本文不采用，记录取舍）：React 下可 `XMLSerializer().serializeToString(容器)`，但必须先把外部 CSS 内联（`getComputedStyle` 逐元素或把打包后的 CSS 文本整体塞进 `<style>`）、把节点从 DOM 卡片改写为 `<rect>`+`<text>`、等 `document.fonts.ready` 再量文本、并用 `Range.getClientRects()` 复核折行。已知坑：`foreignObject` 兼容性、字体、CSS 变量与 `@media` 丢失、`transform` 与 `viewBox` 双重缩放、`<defs>` id 与页面 id 冲突、`&`/`<` 未转义。仅当"必须导出用户当前那一帧（含手拖位置与折叠态）"时才值得，代价是结果不可测（依赖运行环境）。

已知坑清单（实现时逐条对照，写进 `domain/export/svg.ts` 顶部注释）：

| 坑 | 后果 | 对策 |
| --- | --- | --- |
| 用 `XMLSerializer` 直接序列化画布 | 带类名/`data-*`/React 内部属性 | 从数据重新生成 |
| 忘 `xmlns` | 当 `<img>` 打开空白 | 根元素写死 |
| 外链 `<link>`/`@import` | 离开站点后样式全丢 | 全部内联 |
| 缺中文字体 | 文字溢出、错位 | 安全字体栈 + 10% 余量 + 提示 |
| `foreignObject` | 多数外部工具不支持 | 不用 |
| `<text>` 不折行 | 长中文单行溢出 | 逐行 `<tspan>` |
| marker id 重复 | 箭头错乱 | 前缀 + 每次重建 |
| `viewBox` 与 `width/height` 不一致 | 缩放后裁切 | 同源计算 |
| `&`/`<` 未转义 | 非法 XML | 统一 `escapeXml` |
| bbox 为空 | 0×0 空文件 | 退化 `800×600` + 提示 |

### 7.4 剪贴板（O8）

`navigator.clipboard.writeText`（安全上下文：`https` 或 `localhost`）→ 失败降级为隐藏 `<textarea>` + `execCommand("copy")`。内容：核心问题 + 3 条要点 + 待澄清清单 + 阻断级命中数，保留 markdown 记号（产品稿 O8）。

---

## 8. 校验与检查引擎

### 8.1 统一接口（TS）

```text
# 伪代码（接口，不是实现）
type Severity = "block" | "hint"            # 产品稿只有两档
type Hit = {
  code: "C1"|"C2"|…|"C9"; name: string; severity: Severity;
  nodeIds: NodeId[]; edgeIds: EdgeId[];
  message: string;                          # 产品稿文案，逐字
  goto: { view: ViewId; nodeId: NodeId };   # 点击定位
  fingerprint: string;                      # 供"暂不处理"忽略表与去重
}
type Rule = { code: Hit["code"]; name: string; severity: Severity;
              check(ws: Workspace, ctx: CheckContext): Hit[] }

runChecks(ws: Workspace): Hit[]
  ctx = buildIndex(ws)        # 一次遍历：byId、入/出邻接（按 15 类分桶）、decomposesTo 子图环、连通分量、术语索引
  return RULES.flatMap(r => r.check(ws, ctx))
              .sort(by(severity 阻断优先, code, nodeIds))
```

- 规则只读 `ws` 与 `ctx`：不读 DOM、不读时间、不读 localStorage（纯函数测试面）。
- 每条规则一个导出函数，**状态机守卫复用同一个判定函数**（产品稿 §7："保存时报的"和"推进时报的"是同一段逻辑）：`statemachine` 调 `c1StateSkipped(ws, q)` 决定是否允许推进，不另写一遍。
- 产品稿 §7 约定四条照办：阻断只拦具体动作（C1 拦状态推进与问题清单导出；C4 拦树形布局与两类 SVG 导出）；命中不影响画布可用性，只加红/黄角标；"暂不处理"进 session 忽略表、刷新后重新出现。

### 8.2 九条规则（照产品稿 §7）

| 编号 | 名称 | 严重度 | 判定口径 |
| --- | --- | --- | --- |
| C1 | 状态越级 | 阻断 | `status ∈ {clarified, answered} && (empty(criteria) \|\| empty(answerForm.form))` |
| C2 | 缺反例 | 提示 | `(kind === "core" \|\| status ∈ {clarified, answered}) && empty(examples.bad)` |
| C3 | 孤立问题 | 提示 | 问题在 A 组 5 类边中既无入边也无出边（`ctx.in/out` 按 A 组桶判断） |
| C4 | 分解成环 | 阻断 | `decomposesTo` 子图 DFS 回边 → 环路径（§8.4） |
| C5 | 核心问题未分解 | 提示 | `kind === "core" && !hasOut(id, "decomposesTo")` |
| C6 | 概念未挂问题 | 提示 | `type === "concept" && !hasIn(id, "concernsConcept")` |
| C7 | 规则未挂问题 | 提示 | `type === "rule" && !hasIn(id, "constrainedByRule")` |
| C8 | 待澄清其实可推进 | 提示 | `status === "open" && !empty(statement) && !empty(answerForm.form) && !empty(criteria)` |
| C9 | 示例未挂靠 | 提示 | `type === "example" && !hasIn(id, "illustratedByExample")` |

`empty(v)` 照产品稿：`null`/`undefined`/空白字符串/空数组都算空。

**辅助检查（不计入 9 条）**：`T1 术语同名`（`glossary[].term` 归一化后重复，或 `concept.title` 与某 `glossary.term` 归一化后相同）。产品稿 §7 只定 9 条，故 T1 单独一组、只在检查区"其他提示"折叠区出现，不参与 O6 统计——既不违反产品口径，又满足"术语同名检测"的需求（§8.5）。

### 8.3 增量策略（照产品稿：全量重算）

- 产品稿 §7 约定④要求"检查每次编辑后全量重算（18 节点 <1ms，不做增量）"。本文照办：`runChecks` 全量跑。
- 但**不是每次交互都跑**：`serialize.fingerprint(ws)`（数量 + 各 type 计数 + 关键文本哈希，**不含坐标**）未变则跳过——拖节点、缩放、切视图都不触发检查，这是"不做规则级增量"的等价收益。
- 检查结果不落盘、不进 docStore，只存在内存（`useChecks` 的 `useMemo([fingerprint])`）+ 忽略表进 session；避免把派生数据写进真相。
- 预算：200 节点全量 ≤30ms（§9.1）；超预算先分帧（`requestIdleCallback` 或 16ms 切片），**不**先上 Worker。

### 8.4 循环检测：主算法选**迭代 DFS（三色 + 回边）**，Tarjan 只用于连通分量

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| **迭代 DFS 三色 + 回边收集** | 直接给出**环路径**（`P0 → P1 → P0`），正是产品稿 C4 定位文案要的；实现短；显式栈不怕深链 | 一次保证找到环上的点，多个独立环需多次遍历（可接受） | **主算法（C4）** |
| Tarjan SCC | 一次 `O(V+E)` 出全部强连通分量 | 只给集合，不给"沿哪条边走成环"的顺序；要路径还得在分量内再找 | 只用于**连通分量**（依赖视图"只看某个连通分量"筛选、B3 验收）与将来"依赖环"提示 |
| 拓扑排序残余 | 判断有/无环快 | 只有布尔，拿不到节点集合 | 不用 |

为什么不用 Tarjan 做 C4：产品稿要求"右栏列出环路径 `P0 → P1 → P0`、高亮环上边"——SCC 给等价类，还要在类内重建路径，等于叠两套算法；DFS 回边天然带路径栈。

```text
# 伪代码：迭代 DFS 找 decomposesTo 环（显式栈，防深链爆栈）
function findDecomposeCycles(entities, edges):
  adj = map<id, id[]>()                     # 只含 decomposesTo
  for e of edges where e.type === "decomposesTo": adj[e.source].push(e.target)
  color = 默认 WHITE; cycles = []
  for start of adj.keys():
    if color[start] !== WHITE: continue
    stack = [{ node: start, i: 0 }]; path = [start]; color[start] = GREY
    while stack.length:
      frame = stack[stack.length - 1]
      if frame.i < (adj[frame.node]?.length ?? 0):
        v = adj[frame.node][frame.i]; frame.i += 1
        if color[v] === WHITE: color[v] = GREY; path.push(v); stack.push({node: v, i: 0})
        else if color[v] === GREY: cycles.push(截取(path, v).concat(v))   # [q-p0, q-p1, q-p0]
      else:
        color[frame.node] = BLACK; stack.pop(); path.pop()
  return 去重(cycles, by 排序后的节点集合)
```

- 必须迭代：1000 节点长链在递归下撞栈（Safari 栈更浅），是这类工具线上最典型崩法。
- 环去重：同一环可能被不同起点走到，按"排序后节点集合"去重；每条环报一条路径。
- `dependsOn` 环不归 C4（产品稿 C4 只判 `decomposesTo`），作为 T2 辅助提示，换邻接表复用同一函数。

### 8.5 术语同名检测的中文归一化

目标：`订单` / `订单 ` / `ＯＲＤＥＲ` / `Order` / `限界 上下文` 与 `限界上下文` 都判同名。用于三处：`glossary` 唯一性（产品稿 §5.1 `term` 唯一）、T1、领域元素视图的术语聚合。

```text
# 伪代码（纯函数，单测重点）
function normalizeTerm(raw):
  s = String(raw ?? "")
  s = s.normalize("NFKC")                     # 全角→半角（ＯＲＤＥＲ→ORDER）
  s = s.toLowerCase()                         # 拉丁大小写；中文无影响
  s = s.replace(/[\s\u3000]+/g, "")           # 去所有空白（含全角空格）
  s = s.replace(/[（）()【】\[\]「」『』《》"'“”‘’、，。；：!?！？·,.;:\-_/]/g, "")
  s = s.replace(/[０-９]/g, d => chr(cp(d) - 0xFEE0))   # 兜底全角数字
  return s
```

- **不做**：繁简转换、同义/近义归并、词干化。理由：无字体表依赖下繁简表上万字且误报高；近义应由人在 `concept.synonyms` 显式声明（产品稿 §5.4 有该字段），而不是机器猜。
- 命中策略：`exact`（归一化后全等）→ T1 提示；`near`（编辑距离 ≤1 且长度 ≥3）→ info"疑似同一术语"，仅在术语数 ≤300 时启用。
- 已知边界（写进提示文案）：`订单` 与 `订单信息` 归一化后不同，不报——刻意为之，避免噪声淹没真问题。

---

## 9. 性能预算与边界

### 9.1 预算表（目标值；当前为**推断**，实现后按 §9.3 实测回填）

| 指标 | 18 节点（产品样例） | 200 节点 / 400 边 | 1000 节点 / 2000 边 |
| --- | --- | --- | --- |
| 冷启动到可交互（JS 解析 + 载入 + 首帧） | ≤ 150ms | ≤ 350ms | ≤ 1300ms |
| `layoutDeps` | ≤ 5ms | ≤ 50ms | ≤ 400ms |
| 全量重绘（切视图、导入后） | ≤ 30ms | ≤ 80ms | ≤ 600ms |
| 单节点拖拽一帧（ghost，只动自身 + 关联边） | ≤ 4ms | ≤ 4ms | ≤ 4ms |
| 缩放/平移一帧（改父容器 transform，不经 React） | ≤ 6ms | ≤ 8ms | ≤ 16ms |
| `runChecks` 全量 | ≤ 1ms（产品口径） | ≤ 30ms | ≤ 150ms |
| flush（序列化 + 写） | ≤ 5ms | ≤ 25ms | ≤ 80ms |
| 导出 SVG（O3/O4/O5） | ≤ 30ms | ≤ 120ms | ≤ 600ms |
| 首屏体积（gz，含 React） | ≤ 80 kB | 同左 | 同左 |

超预算处置顺序（先便宜后贵）：① 视口裁剪；② order 迭代降 2 轮；③ 拖拽/缩放期加降级样式类；④ 检查分帧；⑤ 拆 chunk（`manualChunks` 把 React 单独拆出，利用长期缓存，但不减首屏总量）。

### 9.2 React 下必须做的优化

1. **拖拽不进全局 store**：`useDragNode` 用组件本地 `ghost` 状态（被拖节点 + 关联边），松手时才 `dispatch(moveNode)`。否则 60fps × 全量 selector 更新 = 全画布重渲。
2. **`NodeCard` memo + 自定义比较**：只比较 `id/title/type/data.code/data.status/size/pos 是否被选中/命中集合`；`style` 对象在父层 `useMemo` 复用。`hits` 传"该节点命中的 code 数组"，用 `join()` 后的字符串做比较，避免数组引用每次都变。
3. **边层单独 memo**：`EdgeLayer` 依赖 `(posEpoch, edges, layoutVersion)`；`posEpoch` 是"位置提交"计数器（拖拽中不递增，松手才递增），因此拖动时边层不重渲，只重算关联边的 `d`（由 ghost 局部状态驱动）。
4. **selector 精确切片**：`useDoc(s => s.entities.find(...))` 会每次新建对象 → 用 `useShallow` 或存 `byId` 索引，selector 返回**原始值/稳定引用**。
5. **视口旁路**：`usePanZoom` 直接 `containerRef.current.style.transform = …`，并把 `zoom` 以 100ms 节流写回 uiStore（只为顶部百分比显示与 fit 计算）。
6. **rAF 合帧**：`pointermove` 只写 `pendingPointer`，rAF 统一消费；120Hz 触控板否则 120 次/秒状态更新。
7. **视口裁剪（1000 节点必做）**：世界坐标按 `1024×1024` 分块，`Map<bucket, Set<nodeId>>`；只挂载与视口相交的块（`display:none` 隐藏而非卸载，避免反复重建 React 树）。
8. **文本度量用 Canvas2D**：`measure.ts` 用离屏 `canvas.getContext("2d").measureText` + 缓存；**不要**"插入 DOM → 量 → 移除"（200 节点就是 200 次强制同步布局）。
9. **样式收敛**：节点卡片不用 `backdrop-filter`、不多重阴影；类型配色走 CSS 变量 + 类名，不逐节点写内联样式（内联样式也让 memo 比较失效）。
10. **不引 `React.StrictMode` 到生产**：开发期保留（会发现意外副作用），生产构建里 StrictMode 本身几乎无开销，但双调用会干扰性能测量——测性能时关掉。

**明确不做**：Canvas 回退层、Web Worker（先看预算，Worker 会引入独立入口与 `base` 相对路径的额外坑）、离屏截图缓存。

### 9.3 测量手段

1. **内置 HUD**：`?perf=1` 时页脚显示滚动窗口（最近 60 帧）的 p50/p95 帧时间、节点/边数、上次 layout/check/flush 耗时（`performance.now()` + 一个 div）。
2. **`performance.mark/measure`**：关键路径打 4 个点（`read`/`layout`/`render`/`check`），HUD 读 `performance.getEntriesByName()`；DevTools Performance 里能看到同名 measure。
3. **React DevTools Profiler**：录制一次"拖 3 秒 + 缩 3 秒 + 切视图"，看哪个组件在重渲、`why-did-you-render` 不引（体积），用 Profiler 的 "highlight updates" 足够。
4. **数据集生成器**：`?perf=1&n=200` 在内存造 N 个假问题 + 假边（不落盘），压 200/1000 两档；生成器是纯函数，单测也能调。
5. **产物体积**：`vite build` 后 `Get-ChildItem site -Recurse | Measure-Object Length -Sum`，并按 §11 的命令检查 gz 估算（PowerShell `gzip` 不可用时用在线前先本地 `[IO.Compression.GZipStream]` 压一下算长度）。
6. **基线对比**：每次改布局/渲染后跑同一 seed，HUD 的 p95 与 layout 耗时要能对上 §9.1，超了按 §9.1 顺序降级。

---

## 10. 可测试性（vitest）

### 10.1 三层测试，对应三条边界

| 层 | 环境 | 覆盖 | 工具 |
| --- | --- | --- | --- |
| 纯函数（`domain/**`） | `node` | 校验、迁移、布局、检查、导出、path 生成 | `vitest`（默认环境即可） |
| store（`store/**`） | `node` + 内存 Storage 假件 | 节流、备份、配额降级、`storage` 事件、命令与 undo | `vitest` + `vi.useFakeTimers()` |
| 组件（`canvas`/`panels`/`views`） | `jsdom`（文件头 `// @vitest-environment jsdom`） | 首屏渲染、选中、拖拽提交、检查面板点击定位、导出按钮 | `@testing-library/react` + `user-event` |

`domain/**` **必须**能在 node 环境 import（不引 React/DOM/localStorage）——这一条用一条测试守住：`import * as domain from "../domain/index"` 在 node 环境跑通即可；一旦有人在 `domain` 里 import 了 React，`vite` 会在测试里解析成功但运行时抛错，测试立刻红。

### 10.2 命令

```bash
cd src/tcb/toolbox_service/tools_public/tools/problem-domain-canvas/src-web

pnpm install            # 独立包，装在自己目录（不依赖根 workspace）
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest run（默认 node 环境 + jsdom 文件）
pnpm test -- layout     # 只跑名字含 layout 的用例
pnpm test -- --coverage # 可选：需 @vitest/coverage-v8（devDep，可后加）
pnpm build              # vite build → ../site
```

`package.json` scripts（约 6 行）：`dev: vite`、`build: vite build`、`preview: vite preview`、`test: vitest run`、`test:watch: vitest`、`typecheck: tsc --noEmit`。

### 10.3 测试清单

- `domain/schema.test.ts`：8 类 `type`、15 类边与三组归属、`kind` 三档、`status` 五档、默认尺寸（question 260×130 / 其他 180×96）、A 组边集合。
- `domain/validate.test.ts`：I1 重复 id、I2 未知 type/`data` 非对象、I3 悬空边、I4 非法端点组合与自环、I5 重复边、I6 对称边方向纠正、I7 第二条 `decomposesTo` 入边被拒、I8 `code` 重复只提示不阻断。
- `domain/migrate.test.ts`：幂等；缺 `schemaVersion` 拒绝；`schemaVersion: 2` 拒绝且不改原数据；坏字段降级且 `warnings` 非空。
- `domain/layout.test.ts`：有环（产品稿附录 A 的 `q-p1 → q-p0`）100ms 内返回 `null` 或合法坐标且不死循环；同输入两次结果全等；子节点 y > 父节点 y；同层 x 区间不重叠；坐标有限且对齐 `GRID`。
- `domain/checks.test.ts`：用产品稿 §5.9 样例断言 **7 条命中 / 9 个节点命中**（C1×1、C2×2、C3×2、C5×1、C6×1、C7×1、C9×1）；套附录 A 补丁后 9 条全命中且 C4 路径为 `P0 → P1 → P0`；`ＯＲＤＥＲ`/`order`/`ord er` 归一化同名。
- `domain/export.test.ts`：md 树序与快照；`|` 转义；json 两次导出字节相同；svg 含 `xmlns`、无 `foreignObject`、`&` 已转义、`viewBox` 与 `width/height` 一致、`tspan` 行数等于折行缓存行数。
- `store/persistence.test.ts`：内存 Storage + 假定时器 → 300ms 防抖只写一次、2000ms maxWait 强制写、`hidden` 立即 flush；写前备份；`QuotaExceededError` → 回收 backup 重试成功；再失败 → 只读模式且导出仍可用；构造 `{key,newValue}` 事件 → 本地不脏热载、本地脏保留并把对方写进备份。
- `store/history.test.ts`：一次拖拽 = 一步 undo；undo 后文档深等前一状态；栈上限 100 不无限增长。
- `canvas/CanvasView.test.tsx`（jsdom）：渲染 3 节点 → 出现 3 个 `[data-id]`；点击节点 → uiStore.selection 变化；拖拽（`pointerdown/move/up`）→ 松手后 doc 的 `pos` 变化且吸附到 8 的倍数；非法端点连线被拒（不新增边）。
- `panels/ChecksPanel.test.tsx`（jsdom）：导入样例后显示 7 条命中；点一条 → 当前视图切到 `goto.view` 且选中 `goto.nodeId`；"暂不处理"后消失，刷新（重建 store）后重现。

手工验收（DOM/浏览器）：滚轮以指针为锚缩放、空白拖平移、5 视图切换且选中/viewport 复原、状态机非法流转被拒、8 类输出物能打开、双标签不丢数据、`site/` 换目录后仍能打开（§11）。前 6 条对产品稿 §10 B/D/E/F。

---

## 11. 构建产物校验（怎么证明 `site/` 自包含）

目标：证明"把 `site/` 单独拷到任何地方、用任何静态服务器打开，都能跑"。以下命令在工具目录下执行（Windows PowerShell）。

```powershell
cd src/tcb/toolbox_service/tools_public/tools/problem-domain-canvas/src-web
pnpm build                                        # 产出 ../site
cd ..
# 1) 必须有 entry 文件（发布脚本会校验 site/<entry> 存在，build-release.mjs:200-202）
Test-Path .\site\index.html
# 2) 产物里不许出现绝对路径引用（base 写错的第一信号）
Select-String -Path .\site\index.html -Pattern '(src|href)="/(?!/)'   # 期望 0 命中
# 3) 不许有外链（CDN / 字体 / 图片）
Select-String -Path (Get-ChildItem .\site -Recurse -File | % FullName) -Pattern 'https?://'
#    期望：只剩 xmlns 的 http://www.w3.org/2000/svg 与许可证注释
# 4) 不许有环境变量残留
Select-String -Path (Get-ChildItem .\site -Recurse -File -Include *.js | % FullName) -Pattern 'process\.env|import\.meta\.env'
# 5) 不许有 sourcemap
Get-ChildItem .\site -Recurse -File -Filter *.map          # 期望 0 个
# 6) 引用的 assets 必须真的存在（相对路径解析）
$html = Get-Content -Raw .\site\index.html
[regex]::Matches($html, '(?:src|href)="(\./[^"]+)"') | % { Test-Path (Join-Path .\site ($_.Groups[1].Value -replace '^\./', '')) }
# 7) 体积预算
Get-ChildItem .\site -Recurse -File | Measure-Object Length -Sum   # 总量 ≤ 1MB
# 8) 自包含的最终证明：拷到别处 + 静态服务器打开
Copy-Item -Recurse .\site "$env:TEMP\pdc-site-probe" -Force
python -m http.server 8099 --directory "$env:TEMP\pdc-site-probe"
#    打开 http://127.0.0.1:8099/ ，走一遍 §10.3 的 6 条手工验收
```

判据（全部满足才算"产物自包含"）：

1. `site/index.html` 存在，且 `tool.json` 的 `entry: "index.html"` 与之对应（发布脚本按 `site/<entry>` 校验，`build-release.mjs:200`）。
2. HTML 里所有资源引用都是 `./` 相对形式（命令 2、6）。
3. 无任何运行时外链（命令 3）；`xmlns` 是唯一允许的 `http://` 出现。
4. 无 `process.env` / `import.meta.env` 残留（命令 4）——Vite 会把 `import.meta.env.X` 编译成字面量，若写法不当会留下 `undefined` 字符串，命令 4 抓的是残留而命令 4 之后要有一次人工确认"没有 `undefined` 文本"。
5. 无 `.map`（命令 5）。
6. 换目录 + 静态服务器仍可用（命令 8）。
7. 两次构建产物 hash 一致（除构建时间戳）：连续 `pnpm build` 两次，`Get-FileHash site/assets/*.js` 相同 → 说明构建可重复，没有随机化。

自动化建议：把命令 1–6 写成 `scripts/verify-artifact.mjs`（Node 20 内置模块，无依赖），接到发布前或 CI 里；**不要**依赖人工记忆。

---

## 12. 风险表

| # | 风险 | 触发条件 | 缓解 | 若不缓解的后果 |
| --- | --- | --- | --- | --- |
| 1 | **构建产物与发布管线不一致** | 发布脚本只 `cp site/`（`build-release.mjs:203-205`），不会跑 `vite build`；有人改了 `src-web/` 忘构建，或 CI 只跑发布 | `site/` 与源码同 commit；PR 检查"改源码必须带产物 diff"；发布前跑 §11 命令 1–7；`index.html` 里 assets 带 hash，一眼能看出产物新旧；必要时在发布前加一步 `vite build`（属发布管线改动，需拍板） | 线上跑旧代码（用户看不到新功能），或产物与源码不一致导致"本地好的线上坏"，排查成本极高 |
| 2 | 两层坐标漂移（节点层与边层不同步） | 有人给某一层单独加 `transform`/`top` | 只有一个父容器带 `transform`，`viewport.ts` 是唯一改它的地方；测试断言"缩放后边端点仍落在节点边界上" | 线不连节点，缩放越大越明显，用户判定数据坏了 |
| 3 | localStorage 配额打满 | 节点上千 + 长陈述 + 备份；单域上限约 5MB | 整份覆盖写、4MB 预警、回收 backup/session、只读降级 + 导出兜底 | `setItem` 抛异常打断编辑；更糟是备份成功正文没写，重开回到旧版 |
| 4 | 两标签互相覆盖 | 同键两窗口（产品稿 N4 已接受"后写覆盖"） | 只在 dirty 时写；对方版本先落 backup；提示条；不做自动合并 | 后写者静默覆盖前者，用户丢一段思考且无感知 |
| 5 | 分解成环导致布局死循环/NaN | 手工连 `decomposesTo` 回祖先（C4 场景）或导入带环数据 | BFS 层号不降即跳过；order 固定轮数；异常/NaN 返回 `null` → 网格降级；C4 阻断导出 | 页面卡死，或整图坐标变 `NaN` 全飞原点，只能手改 localStorage |
| 6 | 字段改名/迁移链断代 | 产品稿后续改字段，或 v2 只改一半 | 字段名集中在 `domain/schema.ts` 的 TS 类型与常量；逐级单步迁移 + 幂等测试；高版本拒绝载入不降级写 | 老数据打不开（丢历史）或静默丢字段，往往到导出才暴露 |
| 7 | SVG 导出在外部工具里变形 | 用 `foreignObject`/外链字体/忘 `xmlns`；目标机器缺中文字体 | 从数据重算、内联 `<style>`、禁 `foreignObject`、安全字体栈 + 10% 余量 | SVG 空白或文字挤成一坨，导出功能事实失效 |
| 8 | 边层吞掉节点点击 | 边层 `pointer-events` 默认 `auto` 且铺满画布 | 边层 `none`，仅 `path` 开 `stroke`；另用透明宽 path 做 12px 命中区 | 节点选不中/拖不动，用户结论是"工具坏了" |
| 9 | 大图掉帧（React 全量重渲） | 拖一个节点触发 200 个 `NodeCard` 重渲；或每帧写全局 store | 拖拽走本地 ghost + 松手提交；memo/selector 精确切片；rAF 合帧；视口裁剪；拖拽期降级样式 | 拖动粘手（<30fps），用户改用按钮不再拖，核心交互被绕过 |
| 10 | 检查误报淹没有效信号 | 术语近似过宽、A 组边混算导致环误判、C2/C3 在样例上过多 | 只 exact + 严格 near；C4 只判 `decomposesTo`；严重度两档；"暂不处理"忽略表 | 检查区成噪声墙，用户关掉它，9 条规则等于没写 |
| 11 | 源码位置未定导致构建入口分裂 | 落法 A/B 并存或后来搬目录，`outDir` 指向别处 | §1.1 明确 outDir 用相对 config 的路径；§11 命令 1/6 校验产物落点；位置拍板后写进 README 一行 | 有人构建到 `dist/` 而 `site/` 是旧的，发布出去的是几个月前的版本 |
| 12 | 依赖被"顺手"扩大 | 有人为一个小需求引 UI 库/图库，产物膨胀或与文档双真相 | §2.3 依赖清单是白名单，新增依赖要在 PR 里写"体积 + 替代方案"；§11 命令 7 卡体积 | 体积翻倍、首屏变慢；更坏的是引了自带状态的图库，文档不再是唯一真相 |
| 13 | `file://` 直接打开白屏 | 用户双击 `site/index.html`（ESM 被 CORS 拦，产品稿 G2 已注明预期行为） | `index.html` 内提供加载失败提示块，文案写明"需静态服务器打开"；README 给一行命令 | 首次体验即失败，被判"打不开" |

---

## 13. 与既有工具（`tools/wireframe-lab`）的一致性检查

### 13.1 照抄（有意同形）

| 做法 | wireframe-lab 出处 | 本项目落点 | 为什么照抄 |
| --- | --- | --- | --- |
| 命名空间前缀 + `WORKSPACE_SCHEMA_VERSION` + 独立 `migrate` | `persistence.js:11-16`、`core/migrate.js:29-41` | `store/persistence.ts`、`domain/migrate.ts` | 版本与迁移各自演进；混用会导致"改页面要迁工作区" |
| `load*/save*/persist*` 分工 + 索引只放列表字段 | `persistence.js:79-89` | 同 | 打开只读索引，项目多了也不卡 |
| 读不出来就丢、逐项回退、最后建示例 | `persistence.js:165-194` | `persistence.open()` | 损坏数据不许卡启动（产品稿 E2） |
| 会话态单独键、写失败静默 | `persistence.js:91-102` | `persistence.saveSession` | 折叠态/滚动丢了不影响正文 |
| 整份文档 `stableStringify` + 末尾单换行 | `io.js:12-14` | `domain/serialize.ts` | 两次导出字节一致，可 diff |
| 校验返回 `errors[]`（数组，不是抛首条） | `core/validate.js`、`persistence.js:56-65` | `domain/validate.ts` | 加载与导入都要一次看全 |
| `Blob` + `createObjectURL` + `a[download]` | `io.js:55-60` | `export/download.ts` | 无依赖下载的唯一稳定路子 |
| tests 不进产物、工具目录不写 `id/version` | `package.json:5-7`、`tools_public/README.md:39` | `src-web/`、`tool.json` | 发布边界一致 |
| `navigator.storage.persist()` 尽力而为 | `persistence.js:196-201` | `persistence.ts` | 降低被浏览器清理的概率 |

### 13.2 刻意不同（及原因）

| 差异 | wireframe-lab | 本项目 | 原因 |
| --- | --- | --- | --- |
| React 来源 | `site/vendor/react*.js` 本地副本 + `h()` 手写渲染层 | npm 安装 + Vite 构建，React 打进 `assets/*.js` | 现在允许构建链，vendor 手抄的做法只会带来版本漂移（vendor 里的版本无人升） |
| 源码位置 | 源码直接就是 `site/js/**`（无构建） | 源码在 `src-web/`，`site/` 是产物 | 构建链要求源码与产物分离；`site/` 手改会被下次 build 覆盖 |
| 存储形态 | 项目 → 多页（`pages[]`），每页一份 doc | 单工作区一份 `entities/edges` | 产品稿 §11 第 5 条拍板单工作区；多页会让"跨页依赖"无处安放 |
| 几何模型 | 三层布局引擎（`core/position.js`：absolute/anchor/flex-grid） | 绝对坐标 `pos` + 三种确定性布局 | 白板不需要响应式重排；布局引擎会与"人手拖过的位置"打架 |
| 边的模型 | 无独立边，父子靠 `parent` | 独立 `edges[]` + 15 类语义边 + 端点类型表 | 跨类别关系塞不进 `parent` |
| 校验范围 | 只有结构校验（`core/validate.js`） | 结构校验（I1–I8）+ 语义检查引擎（C1–C9 + T1） | 产出质量取决于"想清楚没"，检查是产品能力而非护栏 |
| 撤销 | 未见统一 undo 栈 | `historyStore` + 命令层 | 拖拽/连线/状态推进都是高频误操作 |
| 视图状态 | 页级 doc 自带布局 | workspace 内 `viewport.{overview,deps,model}` | 产品稿 §4.2 要求切视图恢复原位 |
| 导入保护 | 导入分页面/项目两型 | 导入前自动备份 + 一步撤销 | 单工作区下"导入"就是覆盖全部数据 |
| 测试 | `node --test` + `.mjs` | vitest + TS + jsdom 组件测试 | 有 TS 与 React 后，类型与组件测试的收益远大于保持 `node --test` |

---

## 附录 A：实施顺序（供后续 worker，不含代码）

1. `domain/types.ts` + `schema.ts` + `factory.ts` + `serialize.ts` + `validate.ts`（把产品稿 §5 的形状钉死）+ 单测。
2. `domain/checks/`（C1–C9 + DFS 环 + 术语归一化），用产品稿 §5.9 样例断言 7 命中——此时还没有 UI。
3. `domain/layout/`（deps → tree → model → overview 网格落位）+ 单测（含环与确定性）。
4. `store/`（doc/ui/history/commands/persistence）+ 单测（假定时器 + 内存 Storage）。
5. `canvas/`（CanvasView + NodeCard + EdgeLayer + viewport/measure）+ `App.tsx` 三栏壳：只读渲染问题总览。
6. `canvas/usePanZoom` → `useDragNode`（ghost）→ `useConnect` → 状态机按钮 → undo。
7. 5 视图 + 三块面板（左栏 3 段、右栏属性与检查、顶栏 4 按钮）。
8. `domain/export/`（md → json → svg → 剪贴板）+ `?perf=1` HUD，回填 §9.1 实测。
9. `scripts/verify-artifact.mjs`（§11 命令 1–7）+ 产品稿 §10 A–G 逐条验收 + 双标签实测。

## 附录 B：留给上游确认的四处

1. **源码目录最终位置**（§1.1 落法 A/B）：影响 `outDir` 写法与"谁改 `site/`"的约定；本文默认 A，并用 §11 的产物校验兜住错落。
2. **`site/` 是否提交进仓**：发布脚本只 `cp site/`（`build-release.mjs:203-205`），所以要么提交产物、要么在发布前加 `vite build` 步骤。前者简单但产物 diff 噪声大，后者要改发布管线。
3. 产品稿 §11 第 5 条已把多工作区排到 v2；本文据此把 `index:v1` 与 `workspace:<id>` 留成空实现。若现在就要多项目，只需启用这两个键 + `v1_to_v2`，schema 不用改。
4. 产品稿 §7 的 9 条不含"术语同名"，本文把它作为辅助检查 T1（不进 O6 统计）。若要升为 C10，把 `T1` 注册进 `RULES` 并把预期命中数从 7 改成 8，接口不变。
