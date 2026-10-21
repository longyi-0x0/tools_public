# lottery-new

池加抽奖两层结构。池是一类条目的集合，抽奖声明"从哪些池、按什么规则抽"，转盘、九宫格、老虎机只是浮在数据结构上的表演形式，换形式不改数据。

## 模型

```text
Pool    { id, name, entries: Entry[] }
Entry   { id, label, weight = 1, stock = 1, tags: [], meta: {} }

Draw    { id, name,
          slots: [ { key, poolId } ],
          form: { type: 'wheel' | 'grid' | 'slot', options },
          mode: 'a-then-b' | 'b-then-a' | 'independent',
          rule: { [slotKey]: { count, replacement, weighted, pickLimit, hitRate } } }

Round   { id, drawId, seed, mode, win, picks: Outcome[], sample, status }
Outcome { slotKey, poolId, entryId }
```

池不分人员与奖品：人和奖是同一结构，差别只在新建池时模板给的默认值（人 `stock` 为 1，奖品可以多于 1）。引擎里没有按池类型分支的代码。

## 形式

| type | 池数 | 盘面 | 抽取顺序 |
| --- | --- | --- | --- |
| `wheel` 大转盘 | 1..N | 每池一个转盘 | `independent` 同时转；`a-then-b` / `b-then-a` 依次转 |
| `grid` 九宫格 | 1 | 8 格 | 单池 |
| `slot` 老虎机 | 1 | 3 列 | 三连中奖，成败由 `rule.hitRate` 掷 |

形式在 `domain/draw.js` 的 `FORM_SPECS` 里声明自己能吃几个池、一次展示多少条目。

## 抽取顺序

一次抽奖的完整过程固定为四步，结果在第二步就定完：

```text
候选就绪 → 定结果 → 表演 → 入账
```

形式拿只读快照，只负责把已定的结果演出来，不写池、不写账本。动画中断不产生任何账。

## 不变量

1. 剩余库存与已中次数从账本派生，不另存计数。
2. 只在 `settle` 时入账一次，按 `round.id` 幂等。
3. 形式拿只读快照；它的输出只有"演完了"。
4. 大池取样只影响显示，概率在全体候选上算；已定结果必在样本内。
5. 随机源可复现：`Round` 记 `seed`，同一 seed 必得同一组结果。

## 界面

两栏：左边 240px 侧栏列出当前视图的对象，底部 tabbar 在「抽奖」与「池」之间切；右边是详情页 —— 标题、小节、行，分隔靠细线，不画卡片。

- **抽奖页**：名字、形式、槽位（一个槽位一个池，每个槽位配自己的规则）、抽取顺序、开始按钮、中奖记录（撤销、导出）。
- **池页**：名字、条目（一行一条 `名字,权重,份数`）、导入 xlsx、删除。

开奖层是盖住主页的全屏浮层，投到大屏上给所有人看：每池一个盘，空格开始、Esc 退出，尺寸一律用容器查询单位，预览框和投影上是同一套比例。它只演结果，不抽奖也不写账本。

## 文件

```text
site/
├── index.html            主页骨架；开奖层是同页里的 #stage
├── styles.css
├── vendor/               lucky-canvas 1.7.27（Apache-2.0，从 npm 取）
└── src/
    ├── random.js         可复现随机源
    ├── xlsx.js           自写最小 xlsx 读写（读名单、导出记录）
    ├── store.js          localStorage
    ├── domain/           ids pool draw rule engine sample ledger session
    ├── forms/            registry wheel grid slot —— 每种形式 = mapPlan 纯函数 + mount
    └── ui/               dom labels poolsView drawView logView stageView
```

## 验证

domain 层零 DOM 依赖，`node --test tests/*.test.mjs` 直接跑得动（Windows 下目录参数不认，必须用 glob）。

画布形式依赖 canvas，不在单测里覆盖：主页装配在 jsdom 里冒烟（`npm i -D jsdom` 后 `node tests/smoke/index.mjs`，不进 `npm test`、不随工具发布），开奖动画在浏览器里看。
