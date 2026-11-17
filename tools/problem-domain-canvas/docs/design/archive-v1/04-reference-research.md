# 04 参考调研：竞品 / 范式，可借鉴机制与必须规避的反模式

> 用途：为「问题域思考画板」确定「抄什么、避什么」。
> 本产品一句话：把「模糊问题」推成「清晰的问题结构」，再承接领域建模。
> 不是思维导图，不是自由白板——**节点带语义类型，连线带语义，且有「检查复盘」**。

## 0. 读法与证据等级

- 本文每条外部断言后面都挂来源。**能给出 URL 的给 URL；只凭记忆的标 `凭记忆，UNVERIFIED`**，不与已核实结论混排。
- 调研对象共 **21 个**（最低要求 6 个，已覆盖 brief 1–6 条目，并对第 7 条做了保守补充）。
- 本产品的「8 条引导提示」**在仓库里还不存在**：`src/tcb/toolbox_service/tools_public/README.md:55` 只有一行登记 `| problem-domain-canvas | h5 | — | dev |`，没有 design 目录、没有提示清单。因此第 5 节只拿 brief 里**已具名**的 4 条（缺反例 / 循环依赖 / 术语多名称 / 过早混入技术方案）做对照，其余 4 条标 `UNVERIFIED: 清单未落盘`，不臆造。
- 本产品的三项能力基线（后文「缺什么」一列全部对照这三项）：
  - **A 语义连线**：分解 / 依赖 / 共享状态 / 冲突 / 备选角度；涉及参与者 / 发生于场景 / 关注概念 / 受规则约束 / 由事件触发 / 由示例说明；概念关联 / 规则约束概念 / 场景涉及参与者 / 事件改变概念状态。
  - **B 检查复盘**：缺反例、循环依赖、术语多名称、过早混入技术方案。
  - **C 领域建模承接**：领域元素视图 → 领域模型视图。
- 「降级实现」一列的前提：**零构建、原生 ESM、DOM/SVG**——无打包器、无框架、单个 `<script type="module">` 入口。

## 1. 逐对象拆解

### 1.1 问题树 / 逻辑树族

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| 麦肯锡逻辑树（议题树 / 问题树 / 分解树） | 把一个大问题逐层分解到「可操作的最小单元」，配合 7S、七步法做战略评估 | 一棵树：树干=已知问题，树枝=子问题；节点只有文本，边只有「父子分解」 | 只有两条自律规则：分解要 **MECE**（不重不漏）、要追到「可操作的最小单元」；没有工具级强制 | **A**：只有一种边，「依赖 / 共享状态 / 冲突 / 备选角度」无处安放。**B**：只能人工自查 MECE，没有可执行检查器。**C**：完全不建模领域元素 | [麦肯锡逻辑树分析法](https://baike.baidu.com/item/%e9%ba%a6%e8%82%af%e9%94%a1%e9%80%bb%e8%be%91%e6%a0%91%e5%88%86%e6%9e%90%e6%b3%95/7658515)、[issue-tree-generator（MECE 校验/重叠分支识别）](https://github.com/a5c-ai/babysitter/blob/feb68abe397acc14f32b34984975c48fedba2b33/library/specializations/domains/business/business-analysis/skills/issue-tree-generator/SKILL.md) |
| Minto 金字塔原则（对树的「合格性」下定义） | 让分组本身可判定合不合格：上层是下层的总结 | 树 + 三条硬规则：①任一层的思想是下层的概括；②同组必须是同一类思想；③同组必须有逻辑顺序 | 规则是**审查规则**而非输入约束——用户先画完，再被逐条挑 | 同上；但它证明了「同组同类」可以被写成机器检查项（见 2.1 机制 M3） | [WHO 金字塔框架三规则](https://iris.who.int/bitstream/handle/10665/366976/WPR-2023-DHP-001-eng.pdf)、[金字塔原则](https://baike.baidu.com/item/%E9%87%91%E5%AD%97%E5%A1%94%E5%8E%9F%E5%88%99/8111419) |
| Mindomo issue tree（数字实现） | 把 issue tree 搬上画布，做假设驱动 + 证据追踪 | 树节点 = 假设 + 「需要的证据」+ 归属人；分支可整块移动 | 提示缺证据（⚠ no evidence attached）、提示分支重叠（⚠ overlaps branch 2）、移动父节点时子树整体跟随 | **B** 最强的一块：它已经在做「检查复盘」，但检查项只覆盖证据与重叠，不覆盖术语多名称、循环依赖、技术方案混入。**A** 仍然只有分解边 | [Issue Trees That Hold Up Under Partner Review](https://www.mindomo.com/use-cases/idea-organization/issue-trees/) |

**小结**：问题树族的全部「结构」就是**父子分解**这一种边。它能表达「问题被拆开了」，但不能表达「这两个子问题共用同一份状态」「A 依赖 B、B 又依赖 A」。而后者正是问题域的本质。

### 1.2 协作建模工作坊族（物理 + 数字）

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| EventStorming（Brandolini, 2013） | 45 分钟到一天的工作坊，让业务复杂度「从墙上长出来」；分 Big Picture / Process / Design 三级 | 一条**左→右时间轴** + **颜色编码便利贴**（橙=领域事件、蓝=命令、黄=角色/聚合、粉=外部系统/策略）+ 胶带围出的聚合边界 + 限界上下文候选 | 颜色=唯一语义载体（贴纸颜色即类型）；主持人现场纠错；事件必须写「过去式动词短语」 | **A**：语义靠颜色约定，不是类型系统——数字工具里贴纸可随意改色、可把两个聚合连一条自由线。**B**：全部检查靠主持人肉眼。**C**：建模的是**解空间**，不含「待澄清问题」节点 | [EventStorming 练习（含 Brandolini 2013 原始定义与颜色约定）](https://github.com/yPin9/Learning-with-Claude/blob/main/ai/spec_driven_development/practice-c-event-storming.md)、[ddd-master discovery（Big Picture 需真人主持）](https://github.com/pedronauck/skills/blob/99eb06c8af8dea52159f132f5c37b498f66944b5/skills/mine/ddd-master/references/discovery.md) |
| Domain Storytelling（Hofer / Schwentner） | 用「图形化语言」讲清谁在什么场景下、用什么东西、做了什么、得到什么；需求澄清阶段对齐 | 一张**带序号的叙事图**：actor — activity → work object，每条句子里图标词汇表固定，序号强制阅读顺序 | 受限的图标词汇表（不能用任意形状自由发挥）；必须以「句子」为单位（主语-动词-宾语）；编号强制线性 | **A**：它的边有语义（actor 做 activity 于 object），但语义集合是**业务流程**的，不含「冲突 / 备选角度 / 待澄清」。**B**：无检查复盘。**C**：有 actor/work object，但无「规则 / 示例」层，接不到领域规则 | [A Pictographic Language for Domain Message Flow Modeling](https://domainstorytelling.org/articles/domain-message-flow-modeling/) |
| Example Mapping（Matt Wynne / Cucumber） | 开发前把一个 user story 拆到「可测」：故事→规则→例子，并**显式暴露未知** | 四色卡片：蓝=故事、黄=规则、绿=例子、红=问题/未知；一层故事 + N 规则 + 每规则若干例子 | 一 session 只处理一个故事（限流）；每条规则必须至少一个具体例子（含真实数据）；红色「问题卡」是一等公民，问号必须落卡 | **A**：它最接近本产品的「由示例说明」「受规则约束」边，但**只在一个 story 内部有效**，没有跨问题结构、没有依赖/冲突边。**B**：只有「规则无例子」「故事太大」这类主持人判断。**C**：不建模领域概念与聚合边界 | [Example Mapping 方法论（四色卡定义）](https://github.com/a5c-ai/babysitter/blob/main/library/methodologies/example-mapping/README.md) |

**小结**：这一族是**本产品多条语义边（「由示例说明」「受规则约束」「由事件触发」）的直接祖先**。它们的毛病是同一个：语义只活在「卡片颜色 + 主持人脑子」里，一数字化就退化成一堆可随意拖动的矩形。

### 1.3 「有语义的画布」族

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| Obsidian Canvas（JSON Canvas 1.0） | 本地文件里做「空间化笔记」，节点可以是笔记/文件/网页/分组 | `.canvas` = `nodes[]` + `edges[]`；node 有 type/x/y/width/height，edge 有 fromNode/toNode/fromSide/toSide/label | **完全不防**：edge 的 label 是自由文本，没有类型枚举，没有合法性校验 | **A**：连线只有「一条带文字的箭头」。**B**：无。**C**：无。**但它的 schema 演进策略极值得抄**（未知字段保留 → 见 2.1 机制 M10） | [Obsidian Canvas JSON Specification](https://github.com/agricidaniel/claude-obsidian/blob/main/skills/canvas/references/canvas-spec.md) |
| Heptabase | 「读—想—写」闭环的白板知识库：卡片是持久单元，白板是视图 | 白板上的卡片 + section 分区 + 卡片间连线；空间位置本身承载「主题结构」 | 弱：靠卡片/白板两级粒度收敛（不能在半空中画线），靠命名与归档规范 | **A**：无连线类型。**B**：无结构检查。**C**：无。它把「结构」放在**位置**而不是**关系类型**上 | [Heptabase 介绍](https://u.ajkd.com/tools/heptabase/) |
| Tana | 用 supertag 给节点打「类型 + 字段」，把大纲变成轻数据库 | 节点被 supertag 类型化，类型带字段（fields）与视图；节点可在多个 supertag 下 | 类型带来**输入约束**：字段只在实例上出现；视图按类型过滤 | **A**：类型约束的是**节点属性**，不是**连线合法性**——没有「这个类型的节点只能连那类边」。**B**：视图能过滤，但不能报结构缺陷。**C**：无空间画布 | [Tana Supertags](https://outliner.tana.inc/learn/features/supertags) |
| Scrintal | 卡片（笔记）与白板双向绑定 | 卡片—卡片连线 + 白板分组 | 弱 | 与本产品无关的结构能力（无类型化边）。细节与其现状未核实 | `凭记忆，UNVERIFIED` |
| Whimsical | 让非设计师 5 分钟产出「能给老板看」的图 | 用**专用图型**替代自由画布：流程图 / 线框图 / 思维导图 / 文档各自一套组件 + 自动布局 | **最强的一招**：不给你自由画布。想画流程就进流程图，其中每个形状语义固定（开始/判断/动作），连线是流程线 | **A**：语义被**图型**锁死，跨图型无统一模型——思维导图里的「问题」和流程图里的「判断」是两套东西，无法互通。**B**：无复盘。**C**：无 | [Whimsical vs FigJam 对比（含产品定位）](https://whimsicalaireview.org/comparison/whimsical-vs-figjam) |
| FigJam | 自由白板 + 工作坊设施（便签、投票、计时器、模板） | 便签/形状/连线/区域，几乎无语义 | **不防**：靠模板与主持人 | **A**/**B**/**C** 全缺。它是「反模式参照物」：模板给得再多，结构也不可校验 | [FigJam vs Whimsical（FigJam 能力面）](https://toolvs.co/compare/figjam-vs-whimsical) |

**小结**：这一族分成两派——**裸画布派**（Obsidian Canvas / FigJam：自由但零语义）与**类型化派**（Tana / Whimsical：有类型但类型只约束节点或只约束图型）。**没有一家让「连线」本身带受检的语义类型**，这正是本产品的空位。

### 1.4 DDD 建模 / 战略设计工具族

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| Context Mapper | 用 DSL 写战略设计（Bounded Context、Context Map、Shared Kernel/ACL/OHS/PL/CF 等关系），并生成图 | 一份 **CML 文本**（真源）+ 由它生成的上下文图；关系类型是枚举 | **强**：DSL 的语义规则直接拒绝非法组合（哪些模式能配哪些模式），并给出重构建议 | **A**：它证明了「关系类型枚举 + 规则校验」可行（机制 M2、M4），但它只覆盖**解空间**（上下文之间）。**B**：只有 DDD 模式合法性检查。**C**：起点就是领域模型——**没有「问题澄清」这一段**，也不含示例/待澄清 | [Context Mapper 文档首页](https://contextmapper.org/docs/home/) |
| Event Modeling（Adam Dymitruk） | 把系统行为铺成一条时间线，直接产出「蓝图」 | 同一条时间轴上的**泳道**：命令 → 事件 → 读模型 → UI | 结构即约束：一个命令必须产出事件，一个事件必须被某个读模型消费，缺口一眼看见 | **A**：边语义限于「因果推进」。**B**：靠「泳道有洞」隐式检查。**C**：假定事件已明确，即**假定问题已澄清**——正好是本产品要负责的前一段 | `凭记忆，UNVERIFIED`（本次未取到权威源） |
| ddd-crqrs | 示例级 DDD+CQRS 参考实现 | 代码结构 | 不适用 | 与本产品无关；名称与内容均未核实，**不建议在后续文档引用** | `凭记忆，UNVERIFIED` |

### 1.5 交互基线族（选择 / 连线 / 分组 / 缩放 / 持久化）

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| Excalidraw | 手绘感白板；元素模型、绑定箭头、分组、场景坐标、文件持久化 | 元素数组（id/type/几何/angle/version/versionNonce/groupIds/boundElements）+ 箭头 **binding**（两端锚到元素）+ `.excalidraw` JSON（appState + files） | 不防（自由画布），但**几何层面很稳**：分组成员跟着走、箭头绑定点被删后自动解绑、resize 时保持场景坐标 | **A/B/C** 全缺。它的价值全是**交互与数据基线**（机制 M6–M9） | [The Excalidraw model（包即编辑器）](https://github.com/casualoffice/sheets/blob/87a63902d94c85b3c50d3210055373a3d3bae991/docs/SDK_ARCHITECTURE.md)；元素字段细节 `凭记忆，UNVERIFIED` |
| tldraw | 把「形状」做成可扩展的 ShapeUtil，形状 + 绑定都是一等 store 记录 | store records；每类形状一个 `ShapeUtil`，带 props、生命周期钩子（onBeforeCreate / onBeforeUpdate / onResize / onTranslate / onChildrenChange） | 不防，但**每类形状可自带默认值与校验**，非法状态在进 store 前被拦 | **A/B/C** 缺。但它给出了本产品最关键的架构范式：**用「形状类型」承载「节点语义类型」**（机制 M1） | [tldraw ShapeUtils 文档](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/shapes.mdx) |

### 1.6 结构化思考工具族（块引用 / 无层次 / 无限缩进）

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么（对照 A/B/C） | 来源 |
| --- | --- | --- | --- | --- | --- |
| Roam Research | 大纲 + 块级引用，把线性笔记变成网络 | 每个 block 有唯一 ID，可在任意处被 `((block ref))` 引用，「一处改、处处更新」；双向链接聚合反引 | 不防；靠「块」这一最小粒度避免大块文本 | **A**：没有空间画布、没有连线类型。**B**：无。**C**：无。**但它给了本产品「概念被多处引用后怎么反查」的答案**（机制 M11） | [Roam Research 概览](https://github.com/ever-works/awesome-time-tracking/blob/develop/details/roam-research.md) |
| Logseq | 本地优先的大纲 + 块引用 + 日记流 | 同 Roam，文件在本地 | 不防 | 同 Roam（未单独取源，与 Roam 同范式） | `凭记忆，UNVERIFIED` |
| Workflowy | 「一个无限缩进的清单」，替代文件夹 | 无限层级 + **zoom 到任一节点 = 只看这一支** | 不防；靠缩进与 zoom 控制注意力 | **A**：只有父子。**B**：无。**C**：无。**它给了「单问题详情」视图的交互范式**（机制 M12） | [Workflowy 介绍](https://www.array.vc/portfolio/workflowy) |

### 1.7 中文语境的「问题澄清」写法

| 对象 | 解决什么 | 「结构」表达成什么 | 怎么防止用户乱画 | 缺什么 | 来源 |
| --- | --- | --- | --- | --- | --- |
| 麦肯锡方法论的中文转写（逻辑树 + 金字塔 + SCQA） | 培训与文档化：先结论、再分组、再排序；用 SCQA 定位「真问题」 | 文字/PPT 里的树 + 一句话问题陈述（情境-冲突-疑问-回答） | 规则化审稿（结论先行 / 以上统下 / 归类分组 / 逻辑递进） | 中文语境里这类内容基本停留在**书、课、PPT 模板**，工具侧通常是思维导图外壳（把逻辑树画成 mindmap），**语义边与检查能力全部丢失** | [金字塔原则（四项基本原则、SCQA）](https://baike.baidu.com/item/%E9%87%91%E5%AD%97%E5%A1%94%E5%8E%9F%E5%88%99/8111419)、[麦肯锡逻辑树分析法](https://baike.baidu.com/item/%e9%ba%a6%e8%82%af%e9%94%a1%e9%80%bb%e8%be%91%e6%a0%91%e5%88%86%e6%9e%90%e6%b3%95/7658515) |

> 说明：brief 允许「若可得」补充中文语境的澄清类 SaaS。本次检索未取得可核实的独立产品（命中全是方法论词条与导航站），**不编造产品名**。这是覆盖缺口，记入 OPEN。

### 1.8 覆盖矩阵：21 个对象 × 本产品三项能力

`✔`=有可比机制可抄，`△`=部分，`✘`=没有。

| 对象 | A 语义连线 | B 检查复盘 | C 领域建模承接 | 本产品能拿走的东西 |
| --- | --- | --- | --- | --- |
| 麦肯锡逻辑树 | ✘ | △（MECE 自查） | ✘ | 分解边的命名与「追到最小单元」的停止条件 |
| Minto 金字塔 | ✘ | △（三条审查规则） | ✘ | 「同组同类」可机器化 → M3 |
| Mindomo issue tree | ✘ | ✔（缺证据/分支重叠提示） | ✘ | 检查结果的呈现形态：⚠ + 可折叠 → M4、M5 |
| EventStorming | △（颜色即类型） | ✘ | △（聚合/上下文） | 颜色只作投影 → M14；事件命名规范 |
| Domain Storytelling | ✔（actor/activity/object 句法） | ✘ | △ | 一条边读成一句话的文案表 → M13 |
| Example Mapping | △（规则—示例） | △（规则无例子） | ✘ | 「未就绪」显式标记 → M15 |
| Obsidian Canvas | ✘ | ✘ | ✘ | nodes/edges schema + 未知字段透传 → M9、M10 |
| Heptabase | ✘ | ✘ | ✘ | 卡片/视图两级分离（反面：位置即结构） |
| Tana | △（节点类型化） | ✘ | ✘ | 类型注册表思路 → M1 |
| Scrintal | ✘ | ✘ | ✘ | 无（待核实） |
| Whimsical | △（图型内固定形状） | ✘ | ✘ | 只给专用图型，不给自由形状 → M16 |
| FigJam | ✘ | ✘ | ✘ | 无（反模式参照） |
| Context Mapper | ✔（关系枚举 + 语义规则） | ✔（模式合法性） | ✔ | 关系矩阵 + 纯函数检查器 → M2、M4、M9 |
| Event Modeling | △（因果泳道） | △（泳道缺口） | △ | 结构即校验：某类节点必须有某类邻居 |
| ddd-crqrs | ✘ | ✘ | △ | 无（不建议引用） |
| Excalidraw | ✘ | ✘ | ✘ | 绑定/分组/版本+nonce/单文件 → M6–M9 |
| tldraw | ✘ | ✘ | ✘ | ShapeUtil 范式 → M1 |
| Roam | ✘ | ✘ | ✘ | 块级 id + 反查 → M11 |
| Logseq | ✘ | ✘ | ✘ | 同 Roam |
| Workflowy | ✘ | ✘ | ✘ | zoom 单节点 → M12 |
| 中文方法论转写 | ✘ | ✘ | ✘ | SCQA 三格作为问题陈述模板 |

## 2. 可借鉴机制表

### 2.1 机制清单（16 条）

| # | 机制 | 出处 | 为什么适合本产品 | 降到原生 ESM + DOM/SVG 怎么做（一句话） |
| --- | --- | --- | --- | --- |
| M1 | **把「节点语义类型」做成「形状类型」**：每类节点一个定义对象（默认尺寸、图标、允许的出入边、校验钩子） | tldraw ShapeUtil | 本产品 10 类节点（问题 3 类 + 领域元素 6 类 + 备注 1 类）正好一张注册表，而不是 10 个 if 分支 | `const NODE_KINDS = { core_problem: { icon, w, h, inEdges:[...], outEdges:[...], validate(n){...} }, ... }`，渲染与校验都读这张表 |
| M2 | **关系类型枚举 + 合法性矩阵**：不是所有 A→B 都允许 | Context Mapper（DDD 模式组合的语义规则） | 本产品 15 种连线语义必须按「源类型 × 目标类型 × 边类型」校验，否则「涉及参与者」可以连到「领域规则」上 | 一个 `EDGE_RULES = { involves_actor: {from:['scenario'], to:['actor']}, ... }`，连线落库前查表；非法组合直接拒绝并给出候选边类型 |
| M3 | **分组同类检查**（同组必须是同一类思想） | Minto 金字塔规则 2 | 「缺反例 / 术语多名称 / 过早技术方案」需要的正是「同级可比性」判断 | 对某父节点的子集合取 `child.kind` 众数，少数派在复盘面板列出（纯计数，无需 NLP） |
| M4 | **检查器 = 一组纯函数，输入图快照，输出「问题条目（含指回节点 id）」** | Context Mapper 语义校验 + Mindomo ⚠ 提示 | 检查复盘要能点一条就跳到图上定位，要求检查结果必须携带 id | `const CHECKS = [noCounterExample, cycleInDeps, duplicateTerm, techLeak]`，每个 `(graph) => [{level, msg, nodeIds, edgeIds}]`，面板点击即 `focus(nodeId)` |
| M5 | **检查项分级 + 可静音**（⚠ 提示 ≠ 阻断） | Mindomo（⚠ no evidence attached / ⚠ overlaps branch 2 只是提示） | 过早混入技术方案在早期阶段常是合理的，硬拦会让用户弃用 | 每项检查带 `severity`（取 info 或 warn），面板可折叠、可逐项静音，静音状态进持久化 |
| M6 | **连线锚定（binding）**：边记录两端「节点 id + 节点上的哪一侧」 | Excalidraw 箭头 binding | 移动节点时线不能断；语义边尤其不能变成漂浮的装饰线 | edge 存 `{from:{node, side}, to:{node, side}}`，每帧内重算端点，锚点用九宫格枚举（避开贝塞尔求解） |
| M7 | **分组成员随动** | Excalidraw groupIds | 「场景」里的一组领域元素要能整体搬动 | `node.groupId`，拖动时按 groupId 批量位移，命中测试取最大 group |
| M8 | **版本号 + 随机 nonce** 解决并发写冲突 | Excalidraw（version / versionNonce） | 持久化若日后接协作，必须有同构冲突判定；单机也能防「同一元素两次写回互相覆盖」 | 每次变更 `version++`，`versionNonce = Math.random()*2**31 >>> 0`，比较时先比 version 再比 nonce |
| M9 | **单一 JSON 文档 = 唯一真源，视图是派生** | Context Mapper（CML 文本生图）、Excalidraw 场景文件 | 5 个视图必须来自同一份模型，否则「问题总览」和「领域模型」会互相打脸 | `state = {nodes, edges}`，5 个视图各一个 `render(state)` 纯渲染函数，切视图不写 state |
| M10 | **未知字段保留**（向前兼容的 schema） | Obsidian Canvas JSON（JSON Canvas 1.0，未知字段读入后原样写回） | 本产品 schema 一定会长（8 条提示会变、边类型会加），旧文件不能因缺字段就报错 | 解析时只做「必需字段校验 + 其余透传」，写回时 `{...raw, ...normalized}` |
| M11 | **块级 id + 反向引用** | Roam block ref | 「领域概念」被多个问题/规则引用时，详情页要能答「谁在用它」——这也是「术语多名称」检查的数据来源 | 边天然是反向索引：`edges.filter(e => e.to === nodeId)`，无需额外结构 |
| M12 | **zoom 到单节点**（只看看这一支） | Workflowy | 「单问题详情」视图就是 zoom：入参是一个 nodeId，不是一层导航 | `renderDetail(state, focusNodeId)`，其余节点降为面包屑 |
| M13 | **叙事句法 + 序号**：一条连线 = 一个可朗读的句子 | Domain Storytelling | 反馈读得通（「订单 由 支付事件 改变状态」）比 `edge type invalid` 好得多 | `EDGE_PHRASE[type] = (a,b) => `${a}${主语助词}${b}``，所有校验报错文案复用同一张模板表 |
| M14 | **颜色 = 语义投影，语义必须另有类型字段兜底** | EventStorming（颜色语义）+ 本产品 | 把颜色当唯一语义（EventStorming 数字化的通病）就会退化成贴纸画板 | `kind → {color, icon, label}` 单向映射；任何校验/统计只读 `kind`，绝不读颜色 |
| M15 | **「未就绪」信号**：允许显式标记「这段还没想清楚」 | Example Mapping 的红色问题卡 | 本产品有「待澄清」节点类型，但还需要让**一个子问题整体**被标为未就绪，否则复盘面板永远一片红 | 节点加 `open: true`，总览视图按 `open` 计数，而不是逐个弹窗 |
| M16 | **专用图型 > 自由画布**（宁可少一种自由，换一个能用的问题） | Whimsical（每种图型一套组件） | 本产品若允许「随便加形状」，语义类型立刻失守；应只允许 10 类节点 + 15 种边 | 画布只暴露一个「新建」入口 → 先选节点类型（快捷键 1–9），不提供矩形/椭圆/自由文本工具 |

**机制条数：16 条。**

### 2.2 本产品 15 种连线语义 → 最近亲

用来确认「没有一种边是凭空发明的」，同时暴露没有先例的那几种（需要本产品自己立规矩）。

| 边 | 最近亲（出处） | 有先例？ |
| --- | --- | --- |
| 分解 | 逻辑树父子边 · [逻辑树](https://baike.baidu.com/item/%e9%ba%a6%e8%82%af%e9%94%a1%e9%80%bb%e8%be%91%e6%a0%91%e5%88%86%e6%9e%90%e6%b3%95/7658515) | 有 |
| 依赖 | Context Mapper 的模式关系 · [Context Mapper](https://contextmapper.org/docs/home/) | 有（但仅限上下文之间） |
| 共享状态 | 无直接先例；最近的是 EventStorming 的聚合边界 | ✘ 本产品独有 |
| 冲突 | 无直接先例；Example Mapping 的红卡只表示「未知」不表示「冲突」 | ✘ 本产品独有 |
| 备选角度 | Whimsical 的图型切换（不同视角看同一事）· [对比](https://whimsicalaireview.org/comparison/whimsical-vs-figjam) | △ |
| 涉及参与者 | Domain Storytelling 的 actor 关系 · [Domain Storytelling](https://domainstorytelling.org/articles/domain-message-flow-modeling/) | 有 |
| 发生于场景 | Domain Storytelling 的序号线 | 有 |
| 关注概念 | Tana 的字段引用 · [Tana](https://outliner.tana.inc/learn/features/supertags) | △ |
| 受规则约束 | Example Mapping 的规则—故事 · [Example Mapping](https://github.com/a5c-ai/babysitter/blob/main/library/methodologies/example-mapping/README.md) | 有 |
| 由事件触发 | EventStorming 的命令→事件 · [EventStorming](https://github.com/yPin9/Learning-with-Claude/blob/main/ai/spec_driven_development/practice-c-event-storming.md) | 有 |
| 由示例说明 | Example Mapping 的规则—例子 | 有 |
| 概念关联 | Roam 的双向链接 · [Roam](https://github.com/ever-works/awesome-time-tracking/blob/develop/details/roam-research.md) | 有 |
| 规则约束概念 | Context Mapper 的 DSL 约束 | △ |
| 场景涉及参与者 | Domain Storytelling 的句子结构 | 有 |
| 事件改变概念状态 | Event Modeling 的泳道推进 | △（`凭记忆，UNVERIFIED`） |

**结论**：15 条里有 9 条能找到直接先例、4 条只有部分先例；**「共享状态」和「冲突」是本产品独有**——这两条必须自己定义判定语义，不能指望抄现成规则。

### 2.3 5 个视图 → 交互范式来源

| 本产品视图 | 借鉴来源 | 抄什么 |
| --- | --- | --- |
| 问题总览 | 逻辑树 + Mindomo issue tree | 树形态总览 + 每支的「证据/未就绪」角标 |
| 单问题详情 | Workflowy zoom · [Workflowy](https://www.array.vc/portfolio/workflowy) | 以 nodeId 为入口的聚焦视图，父链作面包屑 |
| 依赖与组合 | Context Mapper 的上下文图 | 有向图布局 + 环高亮 |
| 领域元素 | Domain Storytelling 的图标词汇表 · [来源](https://domainstorytelling.org/articles/domain-message-flow-modeling/) | 每类元素固定图标 + 固定连线句法 |
| 领域模型 | Example Mapping 的规则—示例，Context Mapper 的聚合 | 只读派生的「结论层」，不回写问题层 |

## 3. 反模式表（本产品必须避免）

| # | 反模式 | 出处（谁这么干） | 为什么本产品必须避免 |
| --- | --- | --- | --- |
| P1 | **自由连线 + 文字标签充当语义**（`edge.label = "依赖"`） | Obsidian Canvas、FigJam、Excalidraw | 标签是自由文本：用户会写「依赖（弱）」「可能冲突？」，检查器无法枚举，B 类检查全部失效。本产品的边必须是**闭集枚举** |
| P2 | **颜色即类型** | EventStorming 数字化实现 | 改个颜色就改了语义，且无色弱可用性；颜色必须只是 `kind` 的投影（M14） |
| P3 | **把检查做成阻断式校验** | 严格的 DSL 类工具（含 Context Mapper 的保存期规则） | 早期画板必然不完整（还没反例、还没命名）。硬拦会让用户停止记录真实想法，产出变成「为了过检而编的东西」 |
| P4 | **一个视图吃天下**（问题树和领域模型画在同一层） | FigJam / 白板类工作坊模板 | 5 个视图的分工就是「不同抽象层级」；混在一张画布上，用户会拿领域元素去填问题树，术语边界立刻崩 |
| P5 | **树即全部**（父子是唯一关系） | 麦肯锡逻辑树工具、思维导图、Workflowy | 「循环依赖」这个检查项在纯树结构里**根本无法触发**——树没有环。模型一退化成树，B 类检查集体失效 |
| P6 | **靠主持人在场纠错** | EventStorming / Example Mapping 的物理形态 | 本产品是无人陪伴的单人工具。凡是需要「主持人看一眼」的规则都必须落成可执行检查（M4），否则等于没规则 |
| P7 | **为灵活而支持任意形状/任意连线** | Excalidraw / tldraw 开箱态 | 价值主张是「不是自由白板」；一旦允许自由形状，节点语义类型就变成可选项，检查器面对无类型节点只能沉默 |
| P8 | **把结构藏在空间位置里** | Heptabase（白板位置即结构）、Miro 类 | 位置不可校验、不可查询、换视图就丢。结构必须在 `state` 里，位置只是渲染属性 |
| P9 | **要求用户写 DSL / 装插件 / 起构建** | Context Mapper（Eclipse 插件 / VS Code 扩展 / Java 库）· [Context Mapper](https://contextmapper.org/docs/home/) | 与「h5 + 零构建 + 原生 ESM」的交付形态冲突。抄它的语义规则，不抄它的交互形态 |
| P10 | **AI 替用户补全结构、替用户下判断** | Tana / Heptabase 的 AI 编辑能力 · [Tana](https://outliner.tana.inc/learn/features/supertags)、[Heptabase](https://u.ajkd.com/tools/heptabase/) | 本产品是**思考工具**：结构必须由用户自己确立，工具只负责指出缺陷。AI 生成的分支会让「检查复盘」变成检查自己生成的答案 |

**反模式条数：10 条。**

## 4. 「问题树」与「问题域」的差别，在真实工具里如何体现

树工具的硬约束：**每个节点只有一个父节点，边只有「分解」一种**。问题域需要的是有向图 + 多语义边。下面 4 个例子都是树工具**结构上做不到**、而本产品必须做到的。

| # | 场景 | 树工具里会发生什么 | 本产品要做什么 |
| --- | --- | --- | --- |
| E1 | **同一领域概念被起了三个名字**：EventStorming 现场发现「订单状态」在三处写作 OrderStatus / OrderStage / OrderPhase | 逻辑树/思维导图只能新开一个分支「统一术语」，把它记成**一个待办**；三个来源名字挂不回同一个概念，谁也说不清它们指同一样东西（[逻辑树定义](https://baike.baidu.com/item/%e9%ba%a6%e8%82%af%e9%94%a1%e9%80%bb%e8%be%91%e6%a0%91%e5%88%86%e6%9e%90%e6%b3%95/7658515)） | 建 1 个 `领域概念:订单状态` 节点 + 3 条 `概念关联` 边指向三个来源问题；`duplicateTerm` 检查直接列出「同一概念 3 个别名」并给出一键归一 |
| E2 | **同一条规则的两个示例互相矛盾**：Example Mapping 里一条规则下两个例子都写了阈值，一个「满 100 减 10」、一个「满 99 减 10」 | 卡片墙上是两张绿卡 + 一张黄卡，冲突靠人眼发现；树上只能并列两个叶子，冲突不是「结构」而是「文字差异」（[Example Mapping 四色卡](https://github.com/a5c-ai/babysitter/blob/main/library/methodologies/example-mapping/README.md)） | 两个 `示例` 都经 `由示例说明` 边挂到同一条 `领域规则`；`conflictOnRule` 检查报「同一规则的两个示例给出不同阈值」，并把两个示例 + 一个规则三个 id 一起返回 |
| E3 | **两个子问题互相依赖**（A 依赖 B，B 依赖 A） | 树**无法表达**：父子唯一、无环。用户只能在备注里写「注意：这两个互相依赖」，检查器无对象可查 | `依赖` 边是有向边，`cycleInDeps` 跑一次 DFS 找环，把环上节点全高亮。这是「树→图」最不可替代的一条 |
| E4 | **过早混入技术方案**：某分支写着「用 Redis 缓存会话」 | 逻辑树完全合法——分支内容不受类型约束，谁也拦不住；且一旦写上，这一层从此开始谈实现（[issue tree 的证据/重叠提示只管这两项](https://www.mindomo.com/use-cases/idea-organization/issue-trees/)） | 节点类型区分「问题 / 领域元素 / 备注」；`techLeak` 扫问题类节点的文本 × 技术词表 × 出现位置，命中即提示「这像是解法，移到备注或新建备选角度」 |

**补一条结构性差异**：树工具的所有视图（总览、导图、大纲）都是**同一棵树的换皮**；本产品的「问题总览」与「依赖与组合」是**两张拓扑不同的图**（前者边=分解，后者边=依赖/共享状态/冲突/备选角度）。同一份 `state` 派生出两张图，这是任何树工具架构上做不到的。

### 4.1 四条检查项的判定草案（从上述先例落下来）

| 检查 | 借鉴来源 | 判定输入 | 判定草案（原生 JS，无依赖） |
| --- | --- | --- | --- |
| 缺反例 | Example Mapping 的「规则必须有例子」 | 某 `领域规则` 节点的入边 | 统计 `由示例说明` 的入边数，为 0 或示例的 `kind !== 'example'` → 报 info |
| 循环依赖 | Context Mapper 的模式合法性（它拒绝非法组合） | `依赖` 边子图 | 标准 DFS 三色标记；发现回边即返回环上节点序列 |
| 术语多名称 | Minto「同组同类」+ Roam 反查 | 同 `概念关联` 强连通簇内的节点名 | 归一化（去空白/大小写/全半角）后相同或编辑距离 ≤1 且长度差 ≤2 → 报 warn |
| 过早混入技术方案 | Mindomo 的 ⚠ 提示形态 + 本产品节点类型 | 问题类节点的 `text` | 命中技术词表（redis/mq/kafka/index/sdk/api/微服务/中间件…）→ 报 info，并建议移入备注 |

## 5. 启发式问题库（clarity questions）的现成来源，及与本产品引导提示的差异

### 5.1 现成来源

| 来源 | 它给什么 | 形态 | 可信度 |
| --- | --- | --- | --- |
| Minto SCQA（情境-冲突-疑问-回答） | 把「模糊的抱怨」压成一句可回答的问题；冲突是问题的成因 | 填空模板 | [金字塔原则词条（SCQA 四要素）](https://baike.baidu.com/item/%E9%87%91%E5%AD%97%E5%A1%94%E5%8E%9F%E5%88%99/8111419) |
| 麦肯锡「追问成因 / 探究后果」+ 5 Whys | 纵向挖：「为什么会这样」「所以呢」 | 追问序列 | [麦肯锡逻辑树分析法](https://baike.baidu.com/item/%e9%ba%a6%e8%82%af%e9%94%a1%e9%80%bb%e8%be%91%e6%a0%91%e5%88%86%e6%9e%90%e6%b3%95/7658515) |
| Issue tree 的「假设 + 需要的证据」 | 先立假设，再定「要看到什么才算成立」 | 假设/证据对 | [Mindomo issue tree](https://www.mindomo.com/use-cases/idea-organization/issue-trees/) |
| Example Mapping 的红色问题卡 | 「这条规则我们其实不知道」是合法产出 | 未完成标记 | [Example Mapping](https://github.com/a5c-ai/babysitter/blob/main/library/methodologies/example-mapping/README.md) |
| 知识自评类提问（What do I know / what don't I know；What would change your mind?） | 反例与证伪导向的追问 | 问题清单 | [Metacognition case（"What would change your mind?"）](https://www.littleactivity.com/critical-thinking/grade-6/metacognition/grade-6-metacognition-0003) |
| IDEO Design Kit「Frame Your Design Challenge」、Liberating Structures「Wicked Questions」、Pre-mortem（Gary Klein）、Amazon Working Backwards PR/FAQ | 以「如果失败了会怎样」「两个矛盾的要求能同时成立吗」逼出隐含假设 | 工作坊脚本 | `凭记忆，UNVERIFIED`（本次未取源，引用前需补证） |

### 5.2 与本产品「8 条引导提示」的差异

前提：**仓库里没有这 8 条的成文清单**（`README.md:55` 只有一行登记，`tools/problem-domain-canvas/` 目录此前不存在）。以下是与 brief 已具名的 4 条的对照，另 4 条 `UNVERIFIED`。

| 维度 | 现成 clarity questions 库 | 本产品引导提示（已知 4 条） |
| --- | --- | --- |
| 作用方向 | **发散**：帮你想出更多（还有呢？如果……？） | **收敛**：指出结构缺陷（缺反例、有环、多名称、混技术） |
| 是否有对象 | 无状态：一张通用问题清单，谁都能用 | **必须带参数**：以图上具体节点/边为输入，输出带 id 才可定位 |
| 可判定性 | 不可判定：无法说「这一条已满足」 | 可判定：跑一遍就有确定结果 |
| 触发时机 | 事前（开工前问一轮） | **随时 + 复盘**：随图变化增量触发 |
| 失败模式 | 问题库太长，用户跳过 | 提示太吵，用户静音（→ P3 + M5 化解） |
| 适合的位置 | 新建问题时的占位提问、SCQA 三格模板 | 复盘面板的结构体检 |

**结论**：两者不冲突，是两段——现成问题库填「问题陈述」模板，8 条提示管「结构体检」。**不要用问题库替代检查器**：问题库不能告诉你「你这两个示例矛盾」。

## 6. 结论

### 6.1 最该抄的 5 个机制

1. **把节点语义类型做成注册表**（tldraw ShapeUtil 范式）：一张 `NODE_KINDS` 表同时供渲染、新建入口、校验使用，是「不是自由白板」的物理实现。
2. **关系类型枚举 + 合法性矩阵**（Context Mapper 的语义规则）：`EDGE_RULES` 决定哪条边能连哪类节点，非法组合当场拒绝并给候选。
3. **检查器 = 一组纯函数，输出带 nodeId/edgeId 的问题条目**（Mindomo ⚠ + Context Mapper 校验）：这是「检查复盘」能点一条就跳过去定位的唯一做法。
4. **单一 `{nodes, edges}` 真源 + 5 个纯 `render(state)` 派生视图**（Excalidraw 场景文件 / Context Mapper 文本生图）：否则「问题总览」和「领域模型」迟早互相打脸。
5. **未知字段透传的向前兼容 schema**（Obsidian JSON Canvas 1.0）：8 条提示、15 种边都会变，旧文件不能因缺字段就打不开。

### 6.2 最该避的 3 个坑

1. **自由连线 + 文字标签当语义**（Obsidian Canvas / FigJam 的路）：边类型一旦不是闭集，循环依赖、术语多名称、冲突检测全部失去对象。
2. **把模型退化成树**（逻辑树 / 思维导图 / Workflowy 的路）：树里没有环、没有横向边，「依赖与组合」视图和一半检查项直接不存在。
3. **把检查做成阻断式校验，或把结构藏在空间位置里**（严格 DSL 与 Heptabase/Miro 的两端）：前者让用户不敢记录真实想法，后者让结构不可查询、换视图即失。检查只提示可静音，结构只存 `state`。

## 7. 检索记录与自我限制

| 项 | 值 |
| --- | --- |
| 检索工具 | `web_search` 2 次（第一次 8 条查询、第二次 8 条查询，合并去重） |
| 未做 | 未逐页 `web_fetch`，因此只引用**搜索结果页内出现的文本**，未核验页面全文 |
| 对象数 | 21 个；其中 **17 个**有可点开的来源，4 个仅凭记忆（Scrintal、Event Modeling、ddd-crqrs、Logseq） |
| 机制条数 | 16 条（2.1） |
| 反模式条数 | 10 条（3） |
| 问题-领域差异用例 | 4 个（4 的 E1–E4） |
| 已知缺口 | ① 本产品 8 条引导提示的成文清单（仓库不存在，`README.md:55` 仅一行登记）；② 中文语境下独立的「问题澄清」类产品（检索只命中方法论词条与导航站）；③ Event Modeling / ddd-crqrs 的权威源 |
| 引用风险 | 部分来源是第三方社区转述（GitHub 仓库内的 md、导航站），非厂商官方文档；引用结论时优先信「机制存在」，慎引具体界面细节 |
