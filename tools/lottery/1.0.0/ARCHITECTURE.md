# 抽奖台：架构梳理与重写蓝图

这份文档不描述"理想架构"，只做两件事：**把现状量清楚**，**把值得带走的东西挑出来**。
重写时不必读旧代码，读这一份就够。

---

## 一、现状量级

| 文件 | 行数 | 实际职责 | 依赖 |
|---|---:|---|---|
| `site/src/main.js` | 2631 | 壳、侧栏、详情页、池管理页、**9 个弹窗**、文件读写、撤销、toast、图标 | 几乎全部 |
| `site/src/data.js` | 936 | 常量、清洗、**5 代存档迁移**、app CRUD、lottery CRUD、绑定、池 CRUD、run state、摘要、状态 | engine, pools, protocols |
| `site/src/engine.js` | 445 | 纯函数抽奖：drawOnce / undo / void / remaining / eligible | pools, protocols |
| `site/src/workbook.js` | 776 | xlsx ↔ 领域对象，双向编解码 | pools, protocols, stages, xlsx |
| `site/src/xlsx.js` | 526 | 手写 zip + xml，零依赖。**与抽奖无关** | 无 |
| `site/src/stages/*` | 1446 | 形态层，其中 `lucky.js` 431 行是 vendor 封装 | vendor, dom |
| `site/src/draw/main.js` | 602 | 开奖页：状态、快照、键盘、结果面板 | data, engine, stages |
| `site/src/pools.js` | 124 | 池与条目清洗 | 无 |
| `site/src/protocols.js` | 105 | 2 个抽法定义 | 无 |
| `site/src/store.js` | 90 | localStorage 读写 + 迁移触发 | data |
| `site/src/dom.js` / `theme.js` | 132 | h/el/clockTime；主题 | 无 |
| `site/*.css` + `stages/*.css` | 2521 | 样式，无分区注释 | — |
| `tests/*.mjs` | 1952 | 69 条单测 + 2 份 jsdom 冒烟 | — |

**JS 源码约 7800 行，加样式与测试约 12300 行。**
真正干净的只有 `engine.js`、`pools.js`、`protocols.js` 三个文件，合计 674 行（8.6%）。

---

## 二、领域内核（这部分是对的，重写直接抄）

### 2.1 三个概念

```
池 Pool        一堆条目，可复用
条目 Entry     { id, name, weight, capacity, meta, image }
抽法 Protocol  一次开奖填哪几个槽，每个槽从哪个池取、取几个
```

### 2.2 一个等式

> **一次开奖 = 按抽法，从若干池里取出若干条目，填进若干槽。被取走的条目按 `capacity` 消耗名额。**

所有玩法都是这一句的展开：

| 玩法 | 槽 | 池 |
|---|---|---|
| 只抽奖品 | 1 个：`prize`，draw | 奖品池 |
| 只抽人 | 1 个：`person`，draw | 名单池 |
| 奖品抽人 | 2 个：`prize` fixed + `person` draw | 两个池 |
| 人抽奖品 | 2 个：`person` fixed + `prize` draw | 两个池 |

前两种今天不存在，但**不需要新代码**——抽法表里加两行就行。这是重构最大的收益，别丢。

### 2.3 capacity 的三种写法

| 值 | 含义 | 例子 |
|---|---|---|
| `1` | 只能中一次 | 人 |
| `N` | 有 N 个名额 | 二等奖 3 个 |
| `null` | 不限量，可重复抽中 | 阳光普照 / 放回抽样 |

`null` 是 JSON 存不下 `Infinity` 的替代。**不要用 0**——0 在 xlsx 里会被读成脏数据。

### 2.4 抽法为什么必须独立于形态

这是上一轮争论的落点，答案留在这里，省得重写时再想一遍：

| 问题 | 答案 |
|---|---|
| 形态能不能自己声明"我要 2 个池"？ | 不能。"哪个槽是先定的、哪个是抽的"是业务知识，形态一知道就回到原点 |
| 形态该声明什么？ | **表达能力**：能不能转、一次揭晓几个、大字能放几个字 |
| 抽法该声明什么？ | **需求**：几个槽、哪个 fixed、哪个 draw、能不能一次抽多个 |
| 谁决定能不能配？ | 主程序做 `compatible(stage, protocol)` 双向匹配 |
| 把抽法并进形态会怎样？ | 3 形态 × 2 抽法 = 6 个形态对象。加一种玩法要回头改 3 个文件 |

**最硬的理由不是"解耦好听"，是存档**：`result.picks[].slot` 是记录里的列名，也是 xlsx 的列头。
如果槽定义在形态里，换个形态旧记录就读不出来了。槽的形状必须由抽法这个**跟着记录走**的东西定义。

### 2.5 抽法应该只留三个字段

现在的 `protocols.js` 有两个冗余层：

```js
// 现状：11 个字段，其中 3 个是派生值
{ id, label, hint,
  slots: [{ key, source, take, label, hint }],
  spin: 'person',      // ← 就是 take:'batch' 的那个槽，可推导
  focus: 'person',     // ← 就是 spin 的那个槽，可推导
  requires: {...} }    // ← 就是 slots 的映射，可推导
```

重写成：

```js
{
  id: 'prize-person',
  label: '奖品抽人',
  slots: [
    { key: 'prize',  label: '奖项',   source: 'fixed' },
    { key: 'person', label: '中奖人', source: 'draw', take: 'batch' },
  ],
}

// 派生：spin = 带 take 的槽；focus = spin；anchor = source:'fixed' 的槽
// 能力需求：slots.length / 有 batch 则 winners:'many' / spin: 1
```

**只有一个字段不干净**：`label: '奖项' / '中奖人'` 仍是业务词，界面要显示它。
建议改成新建抽奖时让用户自己填槽名，抽法只给默认值——这样"人"这个词就从代码里彻底消失了。

---

## 三、12 条硬不变量（重写必须保，测试要照着写）

1. 名额**从 `results` 反推**，不存计数器。删掉记录，名额自动回来。
2. `capacity: null` = 不限量；其余收成正整数；`0` 不合法。
3. 一次开奖 = 一个 `result`，含 `picks[]`，每条 pick 带 `slot + poolId + entryId + name + meta`。
4. 槽的 `key` 是存档与 xlsx 的列名，**与形态无关**。
5. 名额用完的条目权重归 0，自动退出抽签；一轮里没有可抽的就停。
6. **撤销**删掉那一条 pick（记录还在）；**作废**删 pick 且把 `poolId/entryId` 记进 `excluded`，之后不再进池。
7. 作废按 `池 + 条目` 记，不按种类。同名条目在别的池照抽。
8. 形态**不读** `pool.kind`，绑定与开奖页也一律不显示类型。
9. 绑定存在 `lottery.slots = { 槽key: 池id }`，槽不认识池的类型；单池可以填满所有槽。
10. "不重复中奖" = 把**焦点槽**每条 `capacity` 在 `1` 与 `null` 之间切换，不是独立开关。
11. 新建抽奖时**复制**池，不引用。活动中途改池不影响素材库。
12. 存档迁移单向、幂等、原文留 `.backup`。

---

## 四、它为什么坏（六处结构性问题）

### 1. `main.js` 2631 行、88 个函数

视图、交互、持久化、导入导出、九个弹窗的状态机全在一个模块闭包里。
典型症状：改一个按钮的文案，要在 2600 行里翻；`ui` 对象有 15 个字段，没有一个统一的变更入口。

### 2. `data.js` 936 行、37 个导出

领域规则（名额、绑定、不重复中奖）和**五代存档迁移**（v1→v5，约 300 行）挤在一个文件里。
迁移代码是只增不减的历史包袱，和领域规则放一起，每次改规则都得看着它。

### 3. 撤销有两套实现，互相不一致

```js
// engine.js 有正确的：只删那一条 pick
export function undoPick(state, resultId, poolId, entryId)

// main.js:823 却直接切数组，绕过引擎
const next = { ...run, results: run.results.slice(0, -1) };
```

同一条业务规则两个真相。重写时**所有变更必须走同一个入口**。

### 4. `workbook.js` 的清洗规则与 `pools.js` 重复

`capacityOf`、`cleanEntries`、`kindOf` 两边各一套。
结果是修一个"不限量导出变成 1"的 bug，要在写侧和读侧改两处。

### 5. 抽法里的 `spin` / `focus` / `requires` 是派生值

见 §2.5。三个字段可以全删，但派生函数要写对，否则容易算出 `undefined` 的槽。

### 6. 三个形态其实共享同一个 vendor，可插拔是假的

`wheel/grid/slot` 各 120–210 行，都在调 `defineLuckyStage`，而 `lucky.js` 有 431 行是 `lucky-canvas` 的封装。
真正要新增一种形态（比如滚动名单、翻牌墙、抽签筒），会被迫绕过 `defineLuckyStage`——**形态契约藏在一个 vendor 适配层里，不是一个真正的接口**。

### 附：UI 状态没有单一真相

`app.lastView / lastLotteryId / lastPoolId` 存在存档里，`ui.view / lotteryId / poolId / dialog / draft / pending / preview / resultsTab / resultsPicked / resultsEditing` 在内存里。同一件事两处存。

---

## 五、重写骨架（单一方案）

```
src/
  core/                   # 零依赖、纯函数、可单测，不许 import 其他层
    pool.js               # Entry / Pool 的构造与清洗
    engine.js             # draw / undo / void / remaining / eligible
    protocol.js           # 抽法定义 + 派生（spin / anchor / focus / needs）
    summary.js            # 进度、状态、名额汇总

  app/                    # 状态与变更
    state.js              # 单一状态树 + snapshot
    actions.js            # 所有变更的目录：每个 action 是唯一的写入口
    persist.js            # localStorage 读写
    migrate.js            # 迁移链：v5→v6→…，每版一个纯函数

  io/
    xlsx.js               # 只做 zip/xml，零依赖，不懂业务
    workbook.js           # 表 ↔ 领域对象，读写共用一套 schema 常量

  ui/                     # 只读 state，不写 state，不碰 localStorage
    kit.js                # h / el / button / sheet / toast / icon
    shell.js              # 侧栏 + 主区 + 路由
    pages/lotteries.js
    pages/pools.js
    dialogs/new.js        # 新建抽奖（抽法 → 形态 → 名称 → 选池）
    dialogs/stage.js      # 换形态
    dialogs/pool.js       # 池编辑 / 条目编辑
    dialogs/import.js     # 导入确认
    dialogs/results.js    # 结果明细

  stages/                 # 形态
    contract.js           # 契约 + compatible() + registry
    wheel.js
    grid.js
    slot.js
    # 新增形态只加一个文件，注册到 registry，不碰 core / ui

  draw/
    main.js               # 开奖页交互
    view.js               # 领域 → ViewModel，唯一的翻译层
```

### 四条纪律

1. **依赖单向**：`ui / draw → app → core`；`io` 只被 `app` 调用；`stages` 只依赖 `ui/kit`，不 import core。
2. **一个写入口**：`actions.js` 导出的是函数，每个返回新的 state。页面拿到的 `state` 是只读快照，不能 `state.results.push(...)`。
3. **一套 schema**：xlsx 的列名、存档的键、界面显示的词，定义在同一个常量表里。现在这些词散在 `workbook.js`、`data.js`、`main.js` 三处。
4. **形态契约是接口，不是封装**：

```js
// stages/contract.js
export const contract = {
  id: 'wheel',
  label: '大转盘',
  capabilities: { spin: true, reveal: 1, labels: 16, slots: 2 },
  create(mount, { config, theme }) {
    return { update(view), reveal(winners), stop(), destroy() };
  },
};
```

`view` 是 `draw/view.js` 产出的快照，形态**只读不猜**。任何形态（不限于 lucky-canvas）实现这四个方法就能插进来。

---

## 六、重写时先定这三件事

| 要定的 | 选项 | 建议 |
|---|---|---|
| **要不要保旧存档** | 保 v5 / 只保 v4+ / 不保 | 保 v5 就够了。迁移代码独立成 `migrate.js`，永远不进 core |
| **槽名谁提供** | 抽法写死（"奖项/中奖人"） / 用户新建时填 | 后者。前者的代价是"人""奖"这些词永远留在代码里 |
| **形态层用不用 lucky-canvas** | 继续用 / 自己写 | 先定契约，再决定实现。契约定完，lucky-canvas 只是 `wheel.js` 内部的一个细节 |

---

## 七、可以直接搬走的资产

| 文件 | 处理 |
|---|---|
| `engine.js` | 逻辑对，改 import 路径就能用；顺手把 `undoPick` 变成唯一撤销入口 |
| `pools.js` | 直接用，删掉 `cleanMeta` 里的 kind 分支 |
| `protocols.js` | 用 §2.5 的瘦身版重写，60 行以内 |
| `xlsx.js` | **原样搬走**，526 行零依赖，与业务无关，是全项目最值钱的文件 |
| `tests/*.mjs` | 断言可以照抄（69 条已覆盖不变量），运行器 `node --test` 不用改 |
| `styles.css` | 建议重写：2521 行没有分区注释，先按 `kit / shell / page / stage` 四层切开 |

`main.js`、`data.js`、`workbook.js`、`stages/lucky.js` 全部重写，不要重构——2631 行和 936 行的文件，重构成本高于重写。
