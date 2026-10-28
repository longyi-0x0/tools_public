# 抽奖台（lottery）

导入一份 xlsx 就能开抽。模型只有三层：**池**（候选集）→ **抽法**（这一次开奖填哪几个槽）→ **形态**（怎么把它演出来）。至于「哪个池填哪个槽」，是抽奖自己的一件事：存成 `lottery.slots`，在右侧栏的「绑定」里随时改。

现在有「奖品抽人」与「人抽奖品」两种抽法；只抽奖品、只抽人这类玩法，加一个抽法就有了（见「加一种抽法」），引擎与形态都不用动。名额、名单之外的事情仍然在软件外面维护。

三种形态都画在 [lucky-canvas](https://github.com/buuing/lucky-canvas)（Apache-2.0，整包放在 `site/vendor/`，不引外链）上：

- **大转盘**：一整圈扇区，指针停在哪格就得哪个奖。四套皮：红金 / 墨金 / 糖果 / 青瓷。
- **九宫格**：一圈格子 + 中间按钮，跑马灯绕着走；格数跟着条目数走。六套皮：金格 / 粉蓝街机 / 糖果 / 霓虹 / 薄荷 / 墨金。
- **老虎机**：三列滚轮各转各的，停下时对齐同一个条目。三套皮：红包机 / 霓虹机 / 盲盒机。

概率不在前端：形态只调 `play()` 与 `stop(index)`，抽谁由引擎按「剩余名额 × 权重」先定好。抽奖页的配色由形态自带，不跟主页主题走。

## 三个词

| 词 | 是什么 | 在哪 |
| --- | --- | --- |
| 池 | 一堆候选。`kind`（`people` / `prizes` / `items`）**只决定创建与编辑时问哪几个字段**，抽法、槽、绑定、引擎都不看它 | `site/src/pools.js` |
| 条目 | 池里的一项：名称、数量、权重、图片（先留字段）、`meta` | `site/src/pools.js` |
| 抽法 | 一次开奖填哪几个槽、哪个槽由引擎抽、盘面转哪个池、大字写谁 | `site/src/protocols.js` |
| 绑定 | 这一场里哪个池填哪个槽（`lottery.slots`）；槽不挑池的类型 | `site/src/data.js` |
| 形态 | 只负责画：声明自己能画什么，由能力协商决定配不配得上某个抽法 | `site/src/stages/` |
| 结果 | 一次开奖 = 一条 `picks` 记录；名额从记录反推，不另存计数器 | `site/src/engine.js` |

**名额（capacity）只有三种写法**：

- 正整数：这个奖有几个名额（一等奖 1、二等奖 3）；
- `1`：人的默认值，一个人只能中一次；
- 不限（存成 `null`）：放回抽样，抽完还在池里。

侧栏那个「每个〈槽名〉只出现一次」的开关，做的就是把**焦点槽**的池每条名额在 `1` 与不限之间切 —— 不是另一个开关，是同一个字段。奖品抽人时是「每个中奖人只出现一次」，人抽奖品时是「每个奖项只出现一次」。

**两个抽法**：

| 抽法 | 槽 | 盘面转 | 揭晓大字 | 要求形态 |
| --- | --- | --- | --- | --- |
| 奖品抽人 | 奖项（先定）+ 中奖人（引擎抽） | 人 | 人 | 能转、能同时显示两个槽、能显示多人 |
| 人抽奖品 | 参与人（先定）+ 奖项（引擎抽） | 奖项 | 奖项 | 能转、能同时显示两个槽 |

**用的时候不分类型**：槽只声明「我要一个池」，具体哪个池由人在「绑定」里选。名单池绑到奖项槽、两个槽共用同一个池（一个池也能抽）都成立，引擎只看名额。一场里可以有多个同类的池，没被任何槽选中的那些标「未参与」。

`kind` 只在两处露面，都在编辑阶段：新建池时选「名单 / 奖品 / 条目」决定问哪几个字段，以及 xlsx 导入时按表名表头认一下。**绑定、抽奖页、结果页一概不显示类型**，只写池名与条数 —— 因为那一刻它是不是「人」跟怎么抽没关系。

多个池时不自动猜绑定：新建弹窗里每个槽都得自己选，选满才让「创建」。一个池时全部槽都用它。

## 用法

1. **两个视图**：左下切「抽奖」与「池」。池是素材库，抽奖是活动。
2. **新建**：左上角 `+` 先弹菜单 —— `从 xlsx 导入` 或 `新建`。新建里依次选抽法、形态、填名称、**每个槽各选一个池**（可以「未绑定」留空，之后补），定一次抽几个与不重复中奖；左边是形态预览，换形态、换池先看一眼。
3. **池是复制品**：新建时绑到的池会复制进这场抽奖。之后改素材不影响已经建好的活动，改活动也不动素材；活动里的池从「编辑」进，「加池」可以再复制一个素材池或建一个空池。
4. **右侧栏**：抽法 / 绑定 / 形态 / 设置 / 操作 五段。绑定是这场抽奖唯一能改「用哪个池」的地方，建好之后也一直能改；抽法一换，配不上的形态会自动换掉，每种形态的配置各存一份，切回来还是原来的样子。
5. **主按钮**在右下角：没有记录时「开始抽奖」，抽了一半「继续抽奖」，抽不动了「查看结果」。
6. **结果**：开抽后详情最上面多一段「结果」。`明细` 里能按奖项或按时间排，进「编辑」后可勾选任意几条一起撤销，也能全选、清空记录、导出 xlsx。
7. **撤销 vs 作废**：撤销是「这次开错了」——记录删掉，条目与名额都回池子；作废是「这个人不在场」——记录留着，但不算中奖、也不再进池（抽奖页按 Delete）。作废记的是「某池里的某条」，与池的种类无关，同名条目在别的池里照抽。
8. **池视图**：改名字、逐行改条目、加一条、导入（替换）/ 追加 / 导出、删除这个池。已经抽出结果的条目删不掉，名额也改不到已抽数量以下。
9. **主题**：齿轮打开，纸白 / 暖沙 / 墨绿 / 靛蓝 / 石墨五套。只作用于主页。

抽奖页占满整屏：开抽按钮在机器自己身上 —— 转盘与九宫格点盘面中央开抽、转动中点盘面停下，老虎机点机身下方的按钮。**主持人先定的那个槽有一列可点的侧栏**（转盘贴左、九宫格贴右、老虎机在机身与按钮之间），点哪一条就用哪一条，投屏与触屏都能操作；键盘 ↑↓ 仍然可换。空格开 / 停，退格撤销上一次，Delete 作废最后一位，Esc 只退全屏。全屏与退出在每个形态自己的角落里。状态存在浏览器 localStorage，刷新不丢。

## 导入导出

数据存在本机浏览器里；xlsx 只用于搬运，不产生「关联文件」。

| 对象 | 导入 | 导出 |
| --- | --- | --- |
| 抽奖 | 设置 + 每个池一张表 + 开奖记录（后面几张可缺） | 同结构快照，导回来即恢复进度与配置 |
| 池 | 一张表，按表名或表头认类型 | 一张表，列随类型 |
| 结果 | —— | 开奖记录 + 奖项统计两张表 |

同名按文件系统的习惯处理：`名称`、`名称 (1)`、`名称 (2)`。导入时可以选择覆盖同名对象或保留两者；覆盖会先确认，已抽过奖的场次还会提示记录会被清空。

### 一张表就是一个池

| 表名认作 | 列 | 说明 |
| --- | --- | --- |
| 设置 | 键 / 值 | 名称、抽法、形态、不重复中奖、一次抽几人、绑定（JSON）、形态配置（JSON）；整张可缺 |
| 奖品 | 奖品名称 / 数量 / 权重 / 等级 / 池名 | 名称必填；数量写 `不限` 就是不限量 |
| 名单 | 姓名 / 部门 / 工号 / 池名 | 姓名必填；人的名额固定 1，「不重复中奖」关掉才变成不限 |
| 条目 | 名称 / 权重 / 上限 / 池名 | 通用池，既能装人也能装奖 |
| 开奖记录 | 序号 / 记录 / 奖项 / 姓名 / 部门 / 工号 / 开奖时间 | 可缺；按「记录」列把人分回同一次开奖 |

- 表名带「奖品 / 奖项」按奖品读，带「名单 / 人员 / 参与」按名单读，带「条目 / 选项 / 任务」按条目读；认不出来时看表头。列的顺序随意。导出时表名是 `类型·池名`（如 `名单·研发`），有两张同类型表会自动加「 2」「 3」后缀。
- `池名` 这一列是给往返用的：表名会被 Excel 截到 31 字、替换非法字符，池名靠这一列原样带回。`设置` 里的「绑定」写的是池名，也正是因为池 id 导入后会重新编号。
- 表头认这些字：`奖品名称 / 奖项名称 / 奖品 / 奖项 / 名称 / 条目`、`数量 / 名额 / 个数 / 份数 / 上限`、`权重 / 概率`、`等级 / 级别`、`姓名 / 名字 / 参与人`、`部门 / 科室 / 单位 / 班级`、`工号 / 员工号 / 编号 / 学号`、`池名 / 池`、`类型`。
- 只读 `.xlsx`。`.xls`、`.csv` 请先另存。空行、没名字的行、重复的名字会跳过，并在导入预览里逐条列出来。
- 不限量导出时写成 `不限`，导回来还是不限；名额列写 `0` 之类读不出正数的值会按 1 算并给提示。

## 规则与边界

- 名额用完的条目不再进池（权重 = 剩余名额 × 单位权重，剩余 0 就抽不到）；一个能抽的都没了就停下。状态由记录推出来：没记录 = 没开始，抽不动 = 已完成。
- 一次开奖抽几个是**这场抽奖的设置**（`batchSize`，1..50），不是形态的旋钮：换外形不该把「一次抽 3 人」重置成 1。没设时退回形态的缺省值（当前三种形态都是 1）。抽法里没有 `take: 'batch'` 的槽就没有这一项。
- 嵌在工具箱里时浏览器不给 iframe 全屏权限，「全屏」会提示一句；舞台本身就是铺满视口的一层。
- 解析、存储、导出都在本机浏览器里完成，没有服务端，也不上传文件。
- 没有账号、多人同步与扫码加入。换设备用导出的 xlsx 带走。
- 旧存档（v4 的池 + 抽奖、v3 的「多活动 + 名单 / 奖品素材」、v2、v1）第一次打开会自动迁到 v5，原文另存到 `<旧键>.backup` 再删原键。v4 的 `pool.role` 会被推成 `lottery.slots`：同一个 role 有多个池时第一个进绑定，其余留着标「未参与」；池 id 与开奖记录一律原样保留。

## 加一种抽法

抽法在 [`site/src/protocols.js`](./site/src/protocols.js) 里，加一项就行，形态不用改：

```js
{
  id: 'item-only',
  label: '只抽奖品',
  hint: '不指定人，抽走一个奖品',
  slots: [{ key: 'prize', source: 'draw', take: 1, label: '奖项' }],
  spin: 'prize',                       // 盘面转哪个槽的池
  focus: 'prize',                      // 揭晓大字写哪个槽
  requires: { spin: 1, slots: 1, winners: 1 },  // 要形态具备什么
}
```

`source: 'fixed'` 是主持人先定（先选奖项 / 先指定上台的人），引擎只校验，抽奖页会给这一槽画一列侧栏；`source: 'draw'` 由引擎按「剩余名额 × 权重」抽，`take: 'batch'` 表示一次可以抽多个。槽**不写池的类型** —— 哪个池填进来由人在「绑定」里选。

## 加一种形态

一个形态就是一个对象，默认导出，登记到 [`site/src/stages/index.js`](./site/src/stages/index.js) 的 `STAGES` 数组里：

```js
// site/src/stages/marquee.js（示例，不在仓库里）
import { createAction, createCleanup, createPicker, createReveal, mount } from './common.js';

export default {
  id: 'marquee',
  label: '跑马灯',
  version: 1,
  capabilities: { spin: 1, slots: 2, winners: 'many', labels: 24 },
  styles: new URL('./marquee.css', import.meta.url).href,
  config: [
    { key: 'speed', label: '速度', type: 'range', min: 1, max: 4, step: 1, value: 2 },
  ],

  create(host, config, api) {
    const cleanup = createCleanup();
    const root = mount(host, 'stage-marquee');
    const picker = createPicker((id) => api.pickPrize(id));   // 列表：点谁选谁
    const action = createAction(() => api.toggle());          // 主按钮：开 / 停
    const reveal = createReveal();                            // 揭晓：大字 / 附注
    root.append(picker.node, reveal.node, action.node);

    return {
      begin({ labels, weights, batch }) {},  // 开始转
      reveal({ winners, prizeName, focus }) {},  // 停下，写上结果
      reset() {},                            // 撤销后回到待机
      update(view) {},                       // 每次状态变化都调
      destroy() { cleanup.clearAll(); },
    };
  },
};
```

`capabilities` 是形态唯一该说的领域相关的话 —— 「我能画什么」，不是「我是什么抽法」：

| 字段 | 含义 |
| --- | --- |
| `spin` | 能同时驱动几个池转动；0 表示不转、直接揭晓 |
| `slots` | 揭晓时能同时显示几个槽 |
| `winners` | 一个槽能显示几个条目：`1` 或 `'many'` |
| `labels` | 一圈最多铺几个标签，只是展示上限，不参与匹配 |

`compatible()` 拿形态的 `capabilities` 与抽法的 `requires` 两边比，所以加形态只填能力、加抽法只填要求，谁都不用改对方。缺字段的形态会被跳过并 `console.warn`，不会把整页拖崩。

要点：

- 引擎与界面只通过 `begin` / `reveal` / `reset` / `update` / `destroy` 打交道；形态不读存档、不抽奖。
- `update(view)` 是唯一的数据来源：`anchor`（待机时已定好的那个槽）、`focus`、`spinning`、`revealed`、`batch`、`handed`、`totalSlots` 等都在里面，形状见 `site/src/draw/main.js` 的 `view()`。
- `api` 是入口：`toggle()` 开停、`pickPrize(id)` / `pickPerson(id)` 选对象、`undo()` / `voidLast()`、`results()`、`exit()`、`fullscreen()`。
- `begin` 收到的 `labels` 是「转动那个槽」的候选名，`weights` 是引擎用的那份权重（剩余名额 × 单位权重），扇区与签数照它分才和概率一致。
- 揭晓写谁看 `focus`：`'person'` 大字写人，`'prize'` 大字写奖。写反了会让人以为又抽了一次。
- 定时器、`requestAnimationFrame`、`ResizeObserver` 一律走 `createCleanup()`；反复开抽用 `clearTimers()`，`destroy()` 才用 `clearAll()`。
- `config` 声明这一形态的旋钮（`range` / `select` / `switch`），主页按它渲染，抽奖页把整份配置交给 `create`。声明 `batch` 才会有「一次抽几个」。
- 样式放在同目录的 `<id>.css`，通过 `styles` 导出；`stages/index.js` 会在启动时统一挂上。
- 尺寸一律用容器单位（`cqw` / `cqh`）：舞台是容器，主页预览框也是容器，同一份样式两边都对得上。

基于 lucky-canvas 的玩法不用写外壳：`stages/lucky.js` 的 `defineLuckyStage({ id, label, kind, capabilities, skins, build, styles, hint })` 已经把顶栏、画布、底栏、开停时序写好了，只给 `build({ labels, weights, w, h, skin })` 返回库的配置即可（`wheel` / `grid` / `slot` 三个形态都这么写）。

## 目录

| 路径 | 内容 |
| --- | --- |
| `tool.json` | 工具箱清单（`kind: h5`，`tags: ["scene"]`） |
| `site/index.html` | 主页外壳 |
| `site/draw.html` | 抽奖页外壳（独立入口） |
| `site/styles.css` | 主页样式与各套主题的配色变量 |
| `site/draw.css` | 抽奖页外壳：铺满、容器查询、揭晓结构、结果弹窗 |
| `site/src/main.js` | 主页：抽奖与池两个视图、弹窗、导入导出 |
| `site/src/draw/main.js` | 抽奖页：舞台、键盘、结果 |
| `site/src/protocols.js` | 抽法：槽、转动哪个槽、揭晓写谁、要形态具备什么 |
| `site/src/pools.js` | 池与条目：编辑字段、名额归一、摘要 |
| `site/src/engine.js` | 引擎：按槽抽、名额、撤销 / 作废（纯函数） |
| `site/src/data.js` | 抽奖与池的数据、绑定、v4 / v3 / v1 迁移、命名 |
| `site/src/workbook.js` | xlsx 读入与导出（抽奖包、池、结果、模板） |
| `site/src/xlsx.js` | 最小 xlsx 读写（ZIP + OOXML），与 `study-hall` 同源 |
| `site/src/store.js` | localStorage 存取、旧存档迁移与备份 |
| `site/src/theme.js` | 主题清单、记忆与切换 |
| `site/src/stages/` | 形态：`index.js` 是登记处与能力协商，`common.js` 是公共零件，`lucky.js` 是 lucky-canvas 装配层与形态工厂 |
| `site/vendor/` | lucky-canvas@1.7.27 整包（Apache-2.0），含 LICENSE 与 package.json 备查 |
| `tests/engine.test.mjs` | 引擎：按槽抽、绑定查找、名额、撤销 / 作废、未绑槽 |
| `tests/pools.test.mjs` | 名额归一、编辑字段、图片占位、池摘要 |
| `tests/data.test.mjs` | v4 / v3 / v1 迁移、绑定与增删池、一次抽几个、抽奖包往返与表名去重 |
| `tests/stages.test.mjs` | 形态登记、能力协商、配置归一化 |
| `tests/store.test.mjs` | 存档迁移落盘、备份不被覆盖、连写只落一次 |
| `tests/smoke/` | jsdom 冒烟：主页渲染与开奖页三形态 × 两抽法（见下） |

## 验证

```bash
npm test          # 65 条单测：引擎、池、绑定、数据与 xlsx 往返、形态、存档
```

单测跑不到主程序（它只碰 DOM）。补一段冒烟，需要 jsdom：

```bash
npm i -D jsdom
node tests/smoke/index.mjs                      # 主页：v4 迁移、两个视图、两池徽标、弹窗
STAGE=wheel PROTOCOL=prize-person node tests/smoke/draw.mjs   # 开奖页：开 → 停 → 侧栏选 → 撤销
```

三个形态 × 两个抽法都该过：

```bash
for s in wheel grid slot; do for p in prize-person person-prize; do
  STAGE=$s PROTOCOL=$p node tests/smoke/draw.mjs
done; done
```

页面不依赖构建。要本地看，在 `site/` 下起一个静态服务即可：

```bash
python3 -m http.server 8787
```

## 发布

随工具箱发布：目录放在工具仓库的 `tools/lottery/`，发布器只收 `tool.json` 与 `site/`。`package.json`、`tests/` 与 `node_modules/` 只用于本机验证，不进发布包。
