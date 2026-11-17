v1 · 2026-11-17 · QD24 架构稿：只给数据结构、管线与边界，不含实现。

事实源：`01-product.md` **291 行版**（已含 PM 增补的 §7 创建与编辑、§8 导出与实例化，本文已按它对齐；若 01 再改，以 01 为准）。01 写 `nodes[]`，简报里的 `entities[]` 属 v1 命名，本文一律用 `nodes[]`。
技术前提（不可推翻）：Vite + React + TS，源码在本工具 `src-web/`，`outDir: "../site"`；无后端、无 CDN、无远程字体；`site/` 提交进仓，发布脚本只拷贝不构建（`build-release.mjs` 只 `cp site`）。

## §1 文档模型定稿

### 1.1 可直接粘的类型（`src-web/src/domain/types.ts`）

```ts
export const SCHEMA_VERSION = 2 as const;
export type NodeId = string;
export type EdgeKey = string;   // `${type}|${source}>${target}`：01 的 edges 无 id，不新增字段
export type Domain = 'problem' | 'solve';
export type Severity = 'error' | 'warning' | 'hint';
export interface Point { x: number; y: number }
export interface Viewport extends Point { zoom: number }
export type QuestionStatus = '未澄清' | '分析中' | '已澄清' | '已回答' | '暂缓';

// 9 个 data 分支，字段全可选：01 §4.4 的样例自己就省略字段（q1 只有 status/criteria、b1 只有 effects），
// 类型不许比事实更严；默认值由 normalize.withDefaults() 一处补。
export interface QuestionData {
  status?: QuestionStatus; deferReason?: string; statement?: string; goal?: string; boundary?: string;
  knowns?: string[]; assumptions?: string[]; positiveCases?: string[]; negativeCases?: string[];
  answerForm?: string; criteria?: string[];
}
export interface ActorData { role?: string; description?: string }
export interface SceneData { trigger?: string; steps?: string[] }
export interface ConceptData { definition?: string; aliases?: string[] }
export interface RuleData { statement?: string; source?: string }
export interface EventData { trigger?: string; effect?: string }
export interface EntityField { name: string; type?: string; required?: boolean; note?: string }
export interface EntityData { identity?: string; fields?: EntityField[]; states?: string[] }
export interface BehaviorData { inputs?: string[]; output?: string; preconditions?: string[]; effects?: string[] }
export interface ConstraintData { expr?: string; kind?: '必须' | '禁止'; enforcementPoint?: string }

// 判别联合：type 是字面量，data 随 type 收窄；NodeDataMap 是「节点类型 → data」唯一映射表。
interface NodeOf<T extends string, D> { id: NodeId; type: T; title: string; notes: string; data: D; pos: Point }
interface NodeDataMap {
  question: QuestionData; actor: ActorData; scene: SceneData; concept: ConceptData; rule: RuleData; event: EventData;
  entity: EntityData; behavior: BehaviorData; constraint: ConstraintData;
}
export type NodeType = keyof NodeDataMap;
export type AnyNode = { [K in NodeType]: NodeOf<K, NodeDataMap[K]> }[NodeType];
export type AnyNodeOf<T extends NodeType> = NodeOf<T, NodeDataMap[T]>;
export type NodeDataOf<T extends NodeType> = NodeDataMap[T];
export const SOLVE_TYPES = ['entity', 'behavior', 'constraint'] as const;
export type Cardinality = '1:1' | '1:N' | 'N:M';
export type EdgeType = 'decomposesTo' | 'dependsOn' | 'involvesActor' | 'occursInScene' | 'concernsConcept'
  | 'constrainedByRule' | 'triggeredByEvent' | 'entityRelation' | 'behaviorOnEntity' | 'constraintOnEntity' | 'supportsQuestion';
// 端点类型不进类型系统（§1.2 第 3 条），由 schema.ts 的 EDGE_RULES 表在 validate 与连线交互里判。
export interface Edge { type: EdgeType; source: NodeId; target: NodeId; cardinality?: Cardinality }

export interface Workspace {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string; goal: string; coreQuestionId: NodeId | null;
  nodes: AnyNode[]; edges: Edge[];
  viewports: Record<Domain, Viewport>;
  meta: { createdAt: string; updatedAt: string };   // ISO 8601
}
```

| 字段 | 01 出处 | 说明 |
| --- | --- | --- |
| `schemaVersion` / `name` / `goal` / `coreQuestionId` | §4.1 | `goal` 就是顶栏那一行目标（§1、§3）；缺失或 `>2` 一律拒载 |
| `nodes[]` / `edges[]` | §4.1 / §4.3 | 9 类节点共用一个信封；11 条边无 id，边身份用 `EdgeKey` 派生 |
| `viewports` | §3 + v1 `viewport.{overview,deps,model}` 收窄 | **01 §4.1 信封未列此字段**，需 PM 写回；与 03 §2.6 的冲突见 §3.7 |
| `meta` | 技术侧新增 | 只有两个时间戳，导出时剥离（否则"两次导出字节一致"不成立） |

### 1.2 为什么判别联合，四条硬规则

1. `switch (node.type)` 之后 `node.data` 自动收窄（`case 'entity'` 下 `.fields` 不用断言），漏分支用 `assertNever(node)` 编译期报错；扩第 10 类节点只改 `NodeDataMap`，其余位置编译期逐个报漏。
2. 不用 `data: Record<string, unknown>`：6 条检查、3 条管线、8 个详情分组每个读点都要自写守卫，字段名拼错只能运行时发现。
3. 不用 branded id 编码端点类型：`entityRelation` 只能连两个 `entity` 是**数据约束**，用品牌类型会让每个 store action 都要断言、收益为负；交给 `EDGE_RULES`（`type → [sourceTypes, targetTypes]`）一张表，validate 与连线共用。
4. 类型里不出现 class / Map / Date 实例：落盘与 JSON 导出都要求 `JSON.parse(JSON.stringify(ws))` 深等于 `ws`，单测守住。

### 1.3 派生字段（不算 schema、不落盘）

| 派生 | 规则 | 谁用 |
| --- | --- | --- |
| `code`（`P0` / `P1.1`） | 从 `coreQuestionId` 沿 `decomposesTo` DFS 编号；01 无此字段 | 左树、状态行、Markdown、TS 骨架的支撑注释 |
| `EdgeKey` | `${type}\|${source}>${target}` | React key、撤销 diff、检查定位 |
| `domainOf(type)` / `supportedBy(problemId)` | 6 类问题域节点 → `problem`，其余 → `solve` / `supportsQuestion` 入边反查 | 域切换、C6、问题详情「解域支撑」 |

## §2 实例化：先定义，再设计

「实例化」在本项目指两件不同的事，混用就会写错代码：

- **运行时实例化**：存储里的 JSON → 内存规范化索引。同进程、毫秒级、用户不可见，错了只是渲染错。
- **导出型实例化**：解域模型 → 外部产物（md / ts）。跨进程，产物要**在外部工具里成立**（能编译、能读），错了是用户资产错。

### 2.1 运行时实例化

```ts
export interface DocIndex {
  readonly byId: ReadonlyMap<NodeId, AnyNode>;
  readonly childrenOf: ReadonlyMap<NodeId, readonly NodeId[]>;      // decomposesTo 出边
  readonly parentsOf: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly edgesByNode: ReadonlyMap<NodeId, readonly EdgeKey[]>;
  readonly edgeByKey: ReadonlyMap<EdgeKey, Edge>;
  readonly supportsByNode: ReadonlyMap<NodeId, readonly NodeId[]>;  // 解域元素 → 问题
  readonly supportedBy: ReadonlyMap<NodeId, readonly NodeId[]>;     // 问题 ← 解域元素
  readonly questionsInTreeOrder: readonly NodeId[];                 // DFS，排序见 §2.3
  readonly codes: ReadonlyMap<NodeId, string>;
  readonly fingerprint: string;                                     // 结构指纹
}
export function buildIndex(ws: Workspace): DocIndex;   // 纯函数，O(V+E)，一次遍历
```

重建策略：**结构性变更全量，几何与 UI 变更不重建**。

| 时机 | 动作 | 理由 |
| --- | --- | --- |
| 载入 / 导入 / 迁移后，以及任何结构性 commit（增删节点或边、改 title/type/data） | 全量 | 写入口只有 `commit()` 一处，顺手重建，避免散落的增量失效判定 |
| 拖动结束改了 `pos`、只改视口/选中/面板/主题、拖拽中的 ghost 位置 | 不重建 | `pos` 与 UI 状态都不进索引（ghost 在 `uiStore`） |
| `fingerprint` 未变（撤销 / redo） | 复用上一份 index | 免一次 O(V+E) |

数值依据：全量 `O(V+E)`，200 节点 ≈ 0.3ms、1000 节点 ≈ 1.5ms（**估算**，验法见 §7）。为省这 1.5ms 去维护 5 张增量表加树序/环失效判定，出错面远大于收益，**不做增量**。

```ts
// 唯一载入入口，纯函数；坏数据降级成 warnings，绝不半打开
export function loadWorkspace(raw: string): { ws: Workspace; warnings: string[] } | { error: string };
// 顺序：大小闸(8MB) → JSON.parse → schemaVersion 判定 → 迁移链 → validate 分级 → withDefaults → buildIndex
```

### 2.2 导出型实例化 · 总则

- 三条管线签名统一：`(ws, index, opts) => { text: string; fileName: string; warnings: string[] }`，纯函数，不读 DOM / 时钟 / 随机；同一 `ws` 两次调用**字节一致**（01 §8.3 第 4 条），唯一非幂等点是文件名里的日期戳。
- 缺失一律降级为**显式占位**（md「（未填）」、ts `unknown` + `// 原类型`、种子用零值），不写空串、不留空洞。
- 文件头统一由 `export/header.ts` 的 `header(ws, index)` 生成：`「未完成项」` 段逐条列「未支撑实体 N 个（C6）· 未澄清问题 N 个（C5）· 引用了已不存在规则 N 处（C5）」，为 0 写「无」（01 §8.2）。A/B/C 共用，不许各自拼。
- 唯一拒绝导出：`validateWorkspace` 报致命错（悬空边、端点类型不合法）→ 整包不导出并给中文原因（01 §8.2），其余一律照导；`title` 为空的节点不会进产物——01 §7.1 的「未命名」是编辑会话里的草稿（§5.4）。

### 2.3 管线 A：Markdown 说明书
输入 `(ws, index)`；输出 `{ws.name}-说明书.md`。结构 = **文件头「未完成项」+ 两节**（01 §8.1）：`## 问题结构`（树，每问题一行「P1 标题 · 状态」+ 陈述 / 判定标准 / 正反例）与 `## 领域模型`（实体字段与 `states[]` 表、行为、约束、`supportsQuestion` 支撑关系）。空节写「（无）」，标题不删。

排序规则（一律逐码点比较 `a < b`，不用 `localeCompare`——ICU 版本会让不同机器产出不同）：

| 位置 | 排序键 |
| --- | --- |
| 问题树 | 根 = `coreQuestionId`，子节点按 `childrenOf` 里的 `nodes[]` 下标升序（01 无 order 字段，**不新造**，文档顺序即意图）；无父问题独立成组「未挂到核心问题」，组内按标题码点序 |
| 实体 | 入边数降序 → 标题码点序 |
| 行为 / 约束 | 所属实体顺序 → 标题码点序（无实体可挂的排最后并标「未挂实体」） |
| 字段 / 状态 / 正反例 / 已知 | 数组原序——人写的顺序就是意图 |

降级：`goal` 空 → 保留行 `> 目标（未填）`；`criteria`/`knowns`/`assumptions` 空数组 → 「（无）」；未支撑的解域元素在第二节单列并在文件头计入 C6。失败条件：仅 schema 致命错。幂等：是。
验收锚点：Markdown 里出现的问题 id 集合 = JSON 里 `question` 的 id 集合（01 §8.3 第 4 条）——所以「未挂到核心问题」组必须输出，不许只导树。

### 2.4 管线 B：TypeScript 类型骨架
输入 `(ws, index)`，只读解域；输出 `{ws.name}-model.ts`。

| 模型元素 | 产物形态 | 规则 |
| --- | --- | --- |
| entity / identity | `export interface <名> { … }` / 接口第一行前注释 | 接口个数 = 工作区 `entity` 个数（01 §8.3 第 2 条）；`// 主键：<identity>` |
| entity.fields | 属性行 | `name: T;`（`required:true` 无 `?`）；`field.type` 映射见下 |
| entity.states | `export type <名>State = '待确认' \| '已选上' \| '候补';` | 紧贴接口上方，值原样 |
| entityRelation | **外键字段**（01 §8 表） | source 侧加：`1:1` → `<目标>Id?: string`；`1:N`、`N:M` → `<目标>Ids?: readonly string[]` |
| behavior | 接口内方法签名 | `<title>?: (input: Record<string, unknown>, ctx?: unknown) => <output>`；`inputs[]` 是自由文本 → 逐条写 JSDoc |
| constraint | 接口内/外注释块 | `/** 约束（必须/禁止）：<expr> @<enforcementPoint> */`；`expr` 不转译成代码 |
| supportsQuestion | 接口上方一行注释 | `// 支撑：<问题 id> <问题标题>`；未支撑写 `// 支撑：无（C6）`（01 §8.3 第 2 条） |

`field.type` 映射：`string`/`number`/`boolean`/`date`（→ `string`，ISO）原样；`enum` → 对应 `State` 联合类型；其余任何词 → `unknown` + 行尾 `// 原类型：<原词>`。
标识符规范化（B 与 C 共用同一个 `identify()` 出口）：中文/字母/数字/`_`/`$` 且首字符非数字 → 原样（TS/JS 标识符允许 Unicode 字母，`interface 选课记录` 合法）；首字符是数字或命中 TS 保留字 → 前缀 `_`；含空格/标点/括号/emoji → 该字符换 `_`，原值写进 `// 原值：<原文>`；规范化后为空或全 `_` → `Field_<序号>`；同接口内重名 → 保留首个，其余 `_<名>_<序号>` 并注 `// 重名`。

降级：`identity` 空 → **该实体整块注释掉并警告**（01 §8 表）；`fields[]` 空 → 空接口 `export interface 学生 {}`；behavior 无 `output` → `void`；实体无标题 → `Entity_<序号>`。失败条件：仅 schema 致命错。幂等：是。

生成样例（输入 = 01 §4.4 的 `e1`/`b1`/`c1`，12 行）：

```ts
// 问题域画板 · 类型骨架 · 选课问题域 · schemaVersion 2
// 未完成项：无
export type 选课记录State = '待确认' | '已选上' | '候补';
/** 约束（必须）：已选人数 < 容量 */
export interface 选课记录 {
  // 主键：选课ID
  /** 原类型：enum */
  状态?: 选课记录State;
  /** 提交选课 @effects 生成一条待确认记录 */
  提交选课?: (input: Record<string, unknown>, ctx?: unknown) => void;
}
// 支撑：P1 选课资格如何判定？
```

### 2.5 管线 C：种子数据
输入 `(ws, index)`；输出 `{ws.name}-seed.ts`；**必须复用同一次运行的 B**——接口名与字段名都出自同一个 `identify()`，这是"可编译"的第一道保证。01 §8 的口径：**每个实体固定 3 条**样例实例，且**第 3 条必须违反该实体至少一条 `constraint`，旁边写 `// 期望：拒绝`**（01 §8.3 第 3 条）；`constraint` 输出 `export function <名>(x: <实体>): boolean { return false; }  // expr 是自由文本，不转译`。

字段缺失填充：

| 缺失 | 填法 |
| --- | --- |
| 字符串 / number / boolean / enum | `'（示例）'` / `0` / `false`；`enum` 用 `states[0]`（`states` 空则类型已降 `string`，值 `'（无状态）'`） |
| 未知类型（`unknown`）/ 主键 / 无 `fields` | `null`（可赋给 `unknown`）/ `'seed-<n>'` / `{}`（空对象对空接口合法） |

可编译的第二、三道保证：① 产物只引用自身声明的类型，不引外部包；② 单测把 B+C 产物写进 `os.tmpdir()` 后 `ts.createProgram`（`noEmit`）断言 `diagnostics.length === 0`，等价于 01 §8.3 第 1 条的 `tsc --noEmit --strict`。失败条件：仅 schema 致命错；实体 0 条 → `export const seed = [] as const;`。幂等：是。

### 2.6 三条管线对 01 §8 的落地

| 01 §8 的层 | 本文 | 验收 |
| --- | --- | --- |
| A 文档型（MD + JSON + SVG） | 管线 A；JSON = `stableStringify(ws)` 原样；SVG 不在 QD24 | 01 §8.3 第 4、5、6 条 |
| B 结构型（TS 类型骨架） | 管线 B | 01 §8.3 第 1、2 条 |
| C 实例型（种子 + 方法签名） | 管线 C | 01 §8.3 第 3 条 |

`meta` 导出时剥离、`viewports` 保留（01 §8.3 第 6 条：JSON 保留 `pos` 以支持原样再导入；A/B/C 不含 `pos`、选中态与缩放）。

## §3 持久化

范式照 `wireframe-lab/site/js/persistence.js`：命名空间前缀 + `schemaVersion` + `load*/save*` 分工 + "读不出来就丢，不半打开"。React 化只多一件事：落盘由 `persistence.ts` 订阅 `docStore` 触发，**组件里不写 storage**。

### 3.1 键设计（常量集中在 `store/storage.ts`，别处禁止拼字符串）

| 键 | 内容 | 写方 / 备注 |
| --- | --- | --- |
| `problem-domain-canvas:workspace:v2` / `…:workspace:backup:v2` | 整份 Workspace（含 `schemaVersion`）/ 上一版原文 | `persistence.flush()`；单工作区，MVP 唯一真相；backup 写前覆盖，配额不足时第一个被回收 |
| `problem-domain-canvas:session:v1` | `{domain, selectedId, theme, canvasOpen, detailOpen, ignoredChecks[]}` | `saveSession`，800ms 防抖，失败静默 |
| `problem-domain-canvas:index:v1` | `{schemaVersion, workspaces:[{id,name,updatedAt}], currentWorkspaceId}` | MVP 只写不读，为多工作区留位 |

### 3.2 写入节流（数值定死）

| 触发 | 数值 |
| --- | --- |
| doc commit 后落盘 | debounce **300ms** |
| 连续操作不停手 | maxWait **2000ms** 强制写一次 |
| 拖拽 / 输入过程中 | **不落盘**（只改内存与 DOM） |
| `visibilitychange→hidden`、`pagehide`、`beforeunload` | 立即 flush |

flush 顺序：`stableStringify`（键排序）→ 与 `lastWrittenText` 比较（全等则跳过，不靠 dirty 标志）→ 备份旧值到 backup 键 → 单次 `setItem` 写正文。**整份写、单键写**：localStorage 无事务，单键 `setItem` 原子，切片写会留下半截状态。

### 3.3 多标签页（`window.storage` 事件）

| 事件 | 处理 |
| --- | --- |
| 主键变化且 `newValue !== lastWrittenText` | 本地不脏 → 静默热载（保留 `domain`/`selectedId`/`viewports`）；本地脏 → 先把对方版本写进 backup，再继续写（后写覆盖，01 §10 已列为已知行为，不弹冲突框） |
| `newValue === null`（键被清） | **不静默重建**：提示「存储已被清空，刷新会回到空工作区」+「立即再存一次」按钮 |
| session 键变化 | 只同步面板开合与主题，不动画布 |

不做三路合并：图文档合并的成本远高于收益，01 §10 已排除多人协作。

### 3.4 迁移链（v1 → vN）

```ts
export const CURRENT = 2;
// 只写相邻两级，禁跨级函数（跨级一多就是笛卡尔积）；只在读路径跑，写永远写当前版本。
export const MIGRATIONS: Record<number, (raw: unknown) => { ws: unknown; warnings: string[] }> = { 1: v1_to_v2 };
export function migrate(raw: unknown, from: number) {
  let cur = raw, v = from, warnings: string[] = [];
  while (v < CURRENT) { const r = MIGRATIONS[v](cur); cur = r.ws; warnings.push(...r.warnings); v++; }
  return { ws: cur, warnings };
}
```

`v1_to_v2` 映射（v1 = `archive-v1/06-tech-design.md` §0.2 的 `schemaVersion: 1`；**每条"丢弃"都进 `warnings[]`，不抛错**）：

| v1 | v2 |
| --- | --- |
| `entities[]`；`order`/`flags`/`size`/`tags`/`createdAt` | 改名 `nodes[]`；丢弃（v2 信封无此字段，尺寸交给 CSS） |
| `type:'note'` / `type:'example'` 节点 | 删节点，文本并入最近父问题的 `notes` / `negativeCases`（无父则丢 + warning） |
| `type:'state'` 节点 | 删节点，标题 push 进所属 `entity.data.states[]` |
| 边 `sharesState` / `conflictsWith` / `alternativeOf` | 丢弃（01 §9 第 1 条）；其余旧边名按 01 §4.3 改名，改不了则丢 |
| `viewport.{overview,deps,model}` | `viewports = { problem: vp.overview, solve: vp.model }`，`deps` 丢 |

规则：纯函数、先深拷贝、`migrate(migrate(x))` 与 `migrate(x)` 深等（单测守住）；入参一律 `unknown` 起步，不用断言掩盖坏数据。

### 3.5 导入外部 JSON 的校验与降级（四道闸）

1. **大小闸**：`text.length > 8MB` 拒绝并回报实际大小。
2. **形态闸**：解析后有 `nodes` 且有 `edges` 数组才算 workspace（本工具只有一种文档形态），否则拒绝，不动现有数据。
3. **结构闸**：`validateWorkspace` 收全部问题后分级——**致命**（`nodes` 非数组、id 重复到不可修、悬空边、端点类型不合法）→ 拒绝；**可修**（`pos` 非有限 → 归 0、未知 `type` → 丢节点、重复 `EdgeKey` → 丢后到、`data` 非对象 → `{}`、`rule.statement`/`constraint.expr`/`entity.identity` 缺 → 保留 + warning，靠 C6/导出降级兜底）→ 修完继续；**可忽略**（未知字段）→ 丢 + warning。
4. **落地闸**：替换当前 ws 前先写 backup + 内存留导入前快照，给一步恢复（01 §7.4：导入本身不进撤销栈）。

### 3.6 配额超限

序列化后 > **4MB** 直接进只读；`setItem` 抛 `QuotaExceededError` 时按序回收：删 backup → 删 session → **只读降级**（顶部「本机存储已满，已停止自动保存」；编辑仍可、导出仍可用，导出不写 localStorage）。读兜底链：主键 → backup → 空工作区（空工作区必须是合法态，01 §3.1 的空状态文案才成立）。启动时请求一次 `navigator.storage.persist()`，失败静默。

### 3.7 一处必须裁决的冲突（已按自洽方案写死，待 PM 确认）

01 §4.1 的信封没有 `viewports`/`meta`，而 03 §2.6 写「详情开合、画板开合、主题、缩放按工作区存 localStorage，不写进节点数据、不进导出」。本文取舍：`viewports` 属于 doc（换域不丢位置、回跳要恢复画板，01 §3/§6 要求），`meta` 属于 doc 但导出时剥离。替代方案是把 `viewports` 整体搬进 session 键，代价是"导出再导入后画布位置不一致"。二者只能选一个，见 OPEN。

## §4 模块与目录边界

```text
src-web/                             # 独立包：自己的 package.json / lockfile，不并入仓根 workspace
├── package.json # scripts: dev/build/test/test:node/test:dom/typecheck · vite.config.ts # base "./"、outDir "../site" · tsconfig.json # strict、bundler、react-jsx · index.html # Vite 入口，构建后即 site/index.html
└── src/
    ├── main.tsx # createRoot + 一次 store 初始化 + 首帧 loadWorkspace · App.tsx # 两列壳：左列(头+树+检查行) / 右列(状态行+画板+详情)
    ├── domain/ # 纯函数层：无 React、无 DOM、无 localStorage
    │   ├── types.ts # §1 全部类型 · schema.ts # 9 类 type、11 条边、EDGE_RULES、默认 data/Viewport
    │   ├── factory.ts # createWorkspace/createNode/createEdge/newId（含 01 §7.2 的子问题继承） · normalize.ts # withDefaults + buildIndex
    │   ├── validate.ts # 致命/可修/可忽略三级 · migrate.ts # MIGRATIONS 链 + v1_to_v2 · serialize.ts # stableStringify/parseJson/fingerprint
    │   ├── checks/ # index.ts # runChecks（跑规则、排序、聚合 counts/byNode） · context.ts # 预取树序/入度/环 · rules.ts # C1–C6 一条一函数
    │   └── export/ # header.ts # 文件头「未完成项」 · markdown.ts # 管线 A · typesSkeleton.ts # 管线 B · seedData.ts # 管线 C（复用 identify()） · fileName.ts # 文件名清洗 + 时间戳
    ├── store/ # 唯一写入口 + 落盘
    │   ├── docStore.ts # Workspace+rev+dirty，只暴露 commit/read · uiStore.ts # domain/selectedId/hover/面板/主题/dragGhost/未命名草稿
    │   ├── historyStore.ts # 撤销栈（≤10 步，01 §7.4） · commands.ts # 一次命令 = 一次 commit = 一条撤销记录
    │   └── persistence.ts # 300/2000ms 节流、写前备份、storage 事件、只读降级 · storage.ts # Storage 适配器 + 键常量
    ├── components/ # 只渲染 + 发命令，不含业务规则
    │   ├── Tree.tsx # 左树两态（问题树 / 实体+关系两段） · Canvas.tsx # 缩放容器+节点层+边层，视口直写 style
    │   ├── NodeCard.tsx # memo + 按 id selector · EdgeLayer.tsx # 单块 SVG，11 条边→path · StatusBar.tsx # 右列顶部 44 状态行
    │   └── DetailPanel.tsx # 详情四分组（属性/关联/检查/支撑） · ExportMenu.tsx # 导出 A/B/C 入口；03 未定位置，待 UI 稿
    ├── views/ # ProblemDomainView.tsx # 问题树画布+问题详情 · SolveDomainView.tsx # 领域模型画布+元素详情
    └── util/ # throttle.ts # debounce(maxWait)/rAF 合帧 · download.ts # Blob + a[download]，延后 revoke
```

共 **37 个文件**（不含就近放置的 `*.test.ts`，见 §8）。依赖方向（单向，违反即审查失败）：

```text
main → App → views → components
                └──→ store ←──┘
                     │
                  domain → util
```

1. `domain/` 只 import `domain/**` 与 `util/**`；**不许** import React、store、components、views（这是纯函数测试面）。
2. `store/` 只 import `domain/` 与 `util/`；不许 import 组件。`components/` 与 `views/` 只经 store 的 selector / action 通信，`views → components` 单向。
3. 改文档只有一条路：`commands.ts` → `docStore.commit()` → 重建 index → 重算检查 → 标 dirty。组件不自己拼新 workspace。
4. `domain/export/**` 只吃 `(ws, index, opts)`，不读 DOM / CSS / `Date.now()`（时间戳由调用方传 opts）。

## §5 状态设计

**三个 store，不是一个也不是两个。**

| store | 装什么 | 落盘 | 变更频率 |
| --- | --- | --- | --- |
| `docStore` | `Workspace` 原样 + `rev` + `dirty` | 是（300ms 节流） | 人操作级 |
| `uiStore` | `domain` / `selectedId` / `hover` / `panel{canvas,detail}` / `theme` / `dragGhost` / `ignoredChecks` / `draft`（未命名草稿） | 只有 `domain/theme/panel/ignoredChecks` 进 session | 中（选中、悬停） |
| `historyStore` | 撤销/重做栈（`Workspace` 引用数组，**≤10 步**，纯内存，刷新即失，01 §7.4） | 否 | 只被工具栏订阅 |

为什么不并成两个：撤销栈塞进 `docStore` 会让每次 push 都触发"要不要存盘"的判断；塞进 `uiStore` 则让"UI 状态不写进 doc"这条硬规则变含糊。`viewports` 在 `docStore`（§3.7），`dragGhost` 与未命名草稿在 `uiStore`。

进撤销栈（01 §7.4/§7.5）：建/删节点（连带边一起回来，算一步）、建/删边、改任意 `title/notes/data` 字段、拖动结束后的 `pos`、问题状态流转、挂/摘 `supportsQuestion`、合并、改 `name/goal/coreQuestionId`。
不进栈：视口、选中、悬停、面板开合、主题、`ignoredChecks`、**重命名与导入/导出**（01 §7.4 明写）、读路径的迁移与规范化。

**「一次拖动只产生一条撤销记录」**：

1. `pointerdown`：`commands.beginDrag(id)` 只记 `before: pos`，**不动 doc、不 push**。
2. `pointermove`：写 `uiStore.dragGhost = {id, pos}`（吸附留到松手），React 只重渲被拖那张卡。
3. `pointerup`：一次 `commands.commit({label:'移动节点', coalesceKey:`pos:${id}`, before})` → 算出最终 `pos` → 一条栈记录，清空 ghost。
4. `pointercancel` / `Esc`：丢弃 ghost，零栈记录。合并规则：同一 `coalesceKey` 且间隔 < **600ms** 的相邻记录并成一条（文本输入按 `字段:节点id` 做 key），避免"敲 20 个字 20 条撤销"。

**「未命名」不落在 doc 里**：01 §7.1 的三条存活规则（只活一个会话、最多一个、不能被引用）在架构上落成一个决定：**草稿放 `uiStore.draft`，不进 `docStore`**。于是它天然不写盘、不进检查、不进导出、不能当端点、不进树序；失焦/切域/新建下一个时若标题仍空 → 直接丢掉；要落库时把空标题写成「未命名」再 `commit()`。子问题继承（01 §7.2：只继承 `boundary`，`status` 重置、关联边不复制）写在 `factory.createChildQuestion()`，不写在组件里。

## §6 检查引擎接口

```ts
export type CheckCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export interface Finding {
  code: CheckCode; severity: Severity;    // error | warning | hint
  message: string;                        // 01 §5 文案逐字，占位符（N、A → B）生成时替换
  nodeIds: readonly NodeId[]; edgeKeys: readonly EdgeKey[];   // 全选高亮
  goto: { domain: Domain; nodeId: NodeId | null; focus?: 'tree' | 'cases' | 'assumptions' | 'checks' };
}
export interface CheckResult {
  findings: readonly Finding[];
  byNode: ReadonlyMap<NodeId, readonly CheckCode[]>;         // 画板右上角 16px 胶囊角标
  counts: { error: number; warning: number; hint: number };  // 左列底部「检查 3 条 · 2 警告 1 提示」
  fingerprint: string;                                       // 未变则复用上次结果
}
export type Rule = (ws: Workspace, index: DocIndex) => readonly Finding[];
export function runChecks(ws: Workspace, index: DocIndex): CheckResult;
```

严重度：C1/C2/C3/C4/C6 = `error`，C5 = `warning`（01 §5 写"错误级别提示"、03 §3.3 只有琥珀两档 → 见 OPEN）；`hint` 当前 0 条使用，接口保留是因为 03 §2.2 的"2 警告 1 提示"是产品文案的一部分。
触发时机：`docStore.commit()` 之后**同步全量重算**（同一 tick，产物与渲染恒一致）；载入/导入/迁移后一次；`fingerprint` 未变则复用；选中、视口、拖拽过程**不触发**。不做增量：全量 `O(V+E)`（≈0.3ms@200、≈1.5ms@1000，估算），增量要维护 6 条规则的局部失效集，属负收益。C3 找环用显式栈迭代 DFS（不递归，避免长链爆栈），命中即返回环路径。

## §7 性能预算（数字均为**估算**，实现后按本节测法校准）
| 指标 | 200 节点 | 1000 节点 | 依据 |
| --- | --- | --- | --- |
| 首屏可交互 / 拖动与平移缩放一帧 | < 300ms / < 16ms / < 8ms | < 900ms / 同左 | 单 chunk、无字体下载；只改 ghost 与 transform，不进 React 提交 |
| `runChecks` 全量 / `buildIndex` | < 3ms / < 1ms | < 15ms / < 3ms | 一次遍历 + 6 条规则 |
| Markdown / 代码骨架导出 | < 30ms / < 10ms | < 120ms / < 40ms | 纯字符串拼接，只读解域 |

必须做三件（其余不做）：① **拖动/平移只写 DOM `transform`**（`store.subscribe` + ref）；② `NodeCard` memo + 按 id 的 selector；③ 边层单块 SVG + **视口裁剪**（只渲染视野内 `path`，留 1 屏余量）。
明确不做：列表虚拟化（1000 节点约 2000 个 DOM 节点，收益不抵复杂度）；分区渲染（会破坏"一个 transform 管两层"的坐标同源约束）；降级阈值：`nodes.length > 800` 实测掉帧时，先只渲染"视野内 + 选中节点邻居"，不改数据模型。
无浏览器自动化时怎么测：① 纯函数在 vitest 里循环 50 次取中位数并断言 `<` 预算；② `?perf=1` 时在 `commit`/`runChecks`/`buildIndex` 打 `performance.mark/measure`，`console.table` 到 `window.__pdcPerf`；③ DOM 帧率只能人肉验：固定步骤（拖一个节点 3 秒、滚轮缩放 3 秒）在 Chrome Performance 看 Long Task，截图进 PR。**不许**把"没测"写成"达标"。

## §8 可测试性
必须无 DOM 依赖：`domain/` 全部、`store/storage.ts`（只依赖注入的 `Storage` 接口）、`store/persistence.ts` 的调度部分（假计时器）、`util/throttle.ts`。

| 层 | 环境 | 必测内容 |
| --- | --- | --- |
| 纯函数 + 假 Storage | `node` | `buildIndex`（树序、环安全、孤立节点）、`validate` 三级、`migrate` 幂等与 warning、三条管线**字节快照**、`runChecks` 六条规则、C3 环路径；`fakeStorage()` 覆盖键缺失 / 坏 JSON / 超版 `schemaVersion` / `QuotaExceededError` 开关 / 只读降级 |
| 组件 | `jsdom` | 左树行序与选中、未选中时「工作区概览」、画板命中、面板互斥收起、未命名草稿落库 |
| 编译校验 | `node` + `ts.createProgram` | B+C 产物落 `os.tmpdir()`，`diagnostics.length === 0`（= 01 §8.3 第 1 条） |

```bash
pnpm --dir src-web test          # 全量（node + jsdom 两个 project）
pnpm --dir src-web test:node     # 只跑纯函数层，最快的一道闸
pnpm --dir src-web test:dom      # 只跑 jsdom 组件
pnpm --dir src-web typecheck     # tsc --noEmit
pnpm --dir src-web build         # 产物落 ../site；自检 index.html 存在 + assets 相对引用 + 无 .map
```

## §9 不做什么

1. **多人协作 / 实时同步**：一本账一个人改得动，冲突合并的成本远高于收益（01 §10 已排除）。
2. **服务端存储与账号**：产物是静态站点，发布脚本只拷 `site/`，加后端就要求部署环境有后端。
3. **插件系统 / 自定义节点类型**：9 类节点 + 11 条边是产品契约，可扩就意味着检查、导出、树序三条管线分支爆炸。
4. **AI 生成与自动补全**：01 §10 要求全部由人输入；任何模型调用都要网络，违背"无远程依赖"。
5. **自由画板 / 无类型节点**：01 §10 第一条；没有 11 条边的类型校验，边的语义立刻失效。
6. **全量 UML（类图字段、时序图、部署图）**：解域只有实体/行为/约束，多一种就是多一套布局加导出。
7. **SQL DDL 与 JSON Schema 导出**：01 §8 明确"等人真要了再谈"；它们的验收都要外部工具，本产品零依赖。
8. **DOM 序列化导 SVG（`XMLSerializer` 画布）**：产物会带上类名与 React 内部属性，且不可测；改为从数据重算。
9. **多工作区 UI**：键位与迁移已留位（`index:v1`、`v2_to_v3`），但开了就要有列表、切换、删除三套交互。
10. **移动端适配 / 触屏手势**：03 §2.5 只到 1200px 窄屏；触屏要重写一套命中与手势，不在本期。

## §10 风险表

| # | 风险 | 触发条件 | 缓解 | 后果 |
| --- | --- | --- | --- | --- |
| 1 | **产物与发布管线不一致** | 改了 `src-web/` 忘 `pnpm build`，或 `outDir` 指错 | 发布前跑 §8 的 `build` + 产物自检（`site/index.html`、`assets` 相对引用、无 `.map`）；PR 模板要求 `site/` 与 `src-web/` 同一次提交 | 仓里的 `site/` 是旧版，线上与源码对不上且没有构建日志可查 |
| 2 | **localStorage 被清空** | 用户清浏览器数据、隐私模式、另一标签删键 | 三级兜底（backup 键、`storage` 事件提示、空工作区合法态）+「立即再存一次」；导出 JSON 是唯一长期备份，界面要写明 | 文档全丢且无服务端副本，只能靠用户自己导出过的文件 |
| 3 | **中文 SVG 导出豆腐块** | 目标机器缺中文字体（03 明令不引远程字体） | 安全字体栈 `"PingFang SC","Microsoft YaHei","Noto Sans CJK SC"` + 折行宽度按 0.9 留余量 + 导出提示"缺字体请替换"；不做文字转路径 | 导出图在别人机器上文字错位/方块，用户会认为工具坏了 |
| 4 | 配额超限静默丢改动 | 节点上千 + 备注很长，序列化 > 4MB | 写前体积判定 + 回收 backup/session + 只读降级并提示导出 | 最后一次编辑未落盘，刷新即丢；忽略提示会重复发生 |
| 5 | 多标签后写覆盖 | 两个窗口同时编辑同一工作区 | 本地不脏则热载、脏则先备份对方版本；01 §10 已接受"写覆盖" | 一方改动被覆盖，backup 只留一版，救不全两次改动 |
| 6 | 生成产物漂移 | 只改 `markdown.ts` 的字段名，或绕过 `identify()` 拼标识符 | B/C 共用 `identify()`；字节快照 + `ts.createProgram` 编译校验；字段名只在 `types.ts` 出现一次 | 生成的 `.ts` 编译不过，或 md 与画板字段名互相矛盾 |
| 7 | 迁移写坏老数据 | `v1_to_v2` 的"丢弃"漏 warning，或写了跨级迁移 | 只写相邻两级、纯函数、先深拷贝、幂等单测；迁移只跑读路径 | 用户 v1 数据部分丢失且无提示，backup 也只有一版 |
| 8 | 检查引擎误报/漏报 | 规则与 01 §5 的判定条件、文案不同步（如 C5 严重度、C2 的"零入边"口径） | 每条规则一个导出函数 + 同目录固定用例；文案逐字取自 01，改文案必须先改 01 | 用户被噪声打断或真问题不报，"它还缺什么"的核心体验失效 |
| 9 | 未命名草稿泄漏进产物 | 草稿被写进 doc、或被导出层当普通节点处理 | 草稿只在 `uiStore.draft`（§5.4）；导出层只读 `docStore`，天然看不到；单测断言导出产物里没有空标题节点 | 产物里出现「未命名」空壳，01 §8.3 的问题 id 集合对不上 |
