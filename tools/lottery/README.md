# 抽奖台（lottery）

导入一份 xlsx 就能开抽。抽法是**人抽奖品**：指定一个人或按名单顺序，按各奖项剩余名额加权抽一个奖。适合年会、摊位、抽奖箱、门店活动。

抽奖页是独立入口，整屏交给形态自己画。三种形态都画在 [lucky-canvas](https://github.com/buuing/lucky-canvas)（Apache-2.0，整包放在 `site/vendor/`，不引外链）上：

- **大转盘**：一整圈扇区，指针停在哪格就得哪个奖。四套皮：红金 / 墨金 / 糖果 / 青瓷。
- **九宫格**：一圈格子 + 中间按钮，跑马灯绕着走；格数跟着奖项数走（3×3 到 8×8）。六套皮：金格 / 粉蓝街机 / 糖果 / 霓虹 / 薄荷 / 墨金。
- **老虎机**：三列滚轮各转各的，停下时对齐同一个奖项。三套皮：红包机 / 霓虹机 / 盲盒机。

概率不在前端：形态只调 `play()` 与 `stop(index)`，抽谁由引擎按「剩余名额 × 单位权重」先定好。抽奖页的配色由形态自带，不跟主页主题走。

## 用法

1. **新建**：左上角 `+` 先弹菜单——`从 xlsx 导入` 或 `新建`。抽奖、名单、奖品三类都是这个入口。
2. **抽奖**：新建时选名称、名单、奖品与形态。名单与奖品会复制到这场抽奖，之后改素材不影响它。
3. **形态与样式**：新建时选名称、名单、奖品与形态；每种形态自带若干套样式（皮肤），在右侧栏的「样式」里换。名单与奖品会复制到这场抽奖，之后改素材不影响它。配置一律在主页改 —— 抽奖页只负责抽，不在大屏上摆选择。不重复中奖是整场的设置。
4. **开始 / 继续 / 重新抽**：主按钮在右侧栏最下方。没有记录时是“开始抽奖”，抽过一半是“继续抽奖”，抽完是“查看结果”；“重新抽奖”清空记录，名单、名额与配置保留。
5. **结果**：开抽后出现在最上面，一格一个人（姓名 / 奖项 / 时间）。「明细」里同样是卡片，可勾选任意几条一起撤销，或全选撤销；撤销只去掉记录，人回到池子里。
6. **奖项与参与人**：方格排布，两行以内直接显示，多出来点“展开全部”。点“编辑”可以改名、调名额、补人、删人（名额改不到已经抽出去的数量以下）。
7. **操作**：右侧「操作」里是一排小按钮——导入、导出、重新抽奖、删除抽奖；主按钮在右下角。
8. **主题**：左下角标签栏最右边的齿轮打开设置，可在纸白、暖沙、墨绿、靛蓝、石墨之间切换。主题只作用于主页；抽奖页的配色由形态自带，不跟主题走。

抽奖页占满整屏：开抽按钮在机器自己身上——转盘与九宫格点盘面中央开抽、转动中点盘面停下，老虎机点机身下方的按钮；键盘空格同样可以开 / 停，↑↓ 换一个人，退格撤销，Delete 作废，Esc 只退全屏。全屏与退出在每个形态自己的角落里。状态存在浏览器 localStorage，刷新不丢。

## 导入导出

数据存在本机浏览器里；xlsx 只用于导入导出，不产生「关联文件」。

| 对象 | 导入 | 导出 |
| --- | --- | --- |
| 抽奖 | 设置 / 奖品 / 名单 / 开奖记录 四张表，后两张可缺 | 同结构快照，导回来即恢复进度与配置 |
| 名单 | 含「姓名」列的表 | 姓名 / 部门 / 工号 |
| 奖品 | 含「奖品名称」「数量」列的表 | 奖品名称 / 数量 / 权重 / 等级 |

同名按文件系统的习惯处理：`名称`、`名称 (1)`、`名称 (2)`。导入时可以选择覆盖同名对象或保留两者；覆盖会先确认，已抽过奖的场次还会提示记录会被清空。

### 抽奖包的表结构

| 表 | 列 | 说明 |
| --- | --- | --- |
| 设置 | 键 / 值 | 名称、抽法、形态、每次抽几人、不重复中奖、关联名单、关联奖品、形态配置（JSON）；整张可缺。抽法与每次几人以形态为准 |
| 奖品 | 奖品名称 / 数量 / 权重 / 等级 | 名称与数量必填 |
| 名单 | 姓名 / 部门 / 工号 | 姓名必填 |
| 开奖记录 | 序号 / 记录 / 奖项 / 姓名 / 部门 / 工号 / 开奖时间 | 可缺；导入时按「记录」把人分回同一次开奖 |

- 表名带「奖」按奖品表读，带「名单 / 人员 / 参与人」按名单表读；认不出来时看表头。列的顺序随意。
- 表头里认这些字：`奖品名称 / 奖项名称 / 奖品 / 奖项 / 名称`、`数量 / 名额 / 个数 / 份数`、`权重 / 概率`、`姓名 / 名字 / 参与人`、`部门 / 科室 / 单位 / 班级`、`工号 / 员工号 / 编号 / 学号`。
- 只读 `.xlsx`。`.xls`、`.csv` 请先另存。空行、没名字的行会跳过并在导入预览里列出来。

## 规则与边界

- 默认“已中奖的人不再进池”。关掉后同一个人可以重复中奖。
- 配额抽完的奖项权重为 0，自然退出抽签；全部抽完就停下。抽奖页默认按名单顺序取下一位，也可以点任意一行。
- 嵌在工具箱里时浏览器不给 iframe 全屏权限，“全屏”会提示一句；舞台本身就是铺满视口的一层。
- 解析、存储、导出都在本机浏览器里完成，没有服务端，也不上传文件。
- 没有账号、多人同步与扫码加入。换设备用导出的 xlsx 带走。

## 加一种抽奖形态

一个形态就是一个文件，默认导出 `{ id, label, mode, styles, config, create }`。
形态拿到的是**整屏**：场景、列表、按钮、角落里的全屏与退出，都归它画。

```js
// site/src/stages/marquee.js（示例，不在仓库里）
import { createAction, createCleanup, createPicker, createReveal, mount } from './common.js';

export default {
  id: 'marquee',
  label: '跑马灯',
  mode: 'prize-person',
  styles: new URL('./marquee.css', import.meta.url).href,
  config: [
    { key: 'speed', label: '速度', type: 'range', min: 1, max: 4, step: 1, value: 2 },
    { key: 'batch', label: '每次抽几人', type: 'range', min: 1, max: 10, step: 1, value: 1 },
  ],

  create(host, config, api) {
    const root = mount(host, 'stage-marquee');
    const picker = createPicker((id) => api.pickPrize(id));   // 列表：点谁选谁
    const action = createAction(() => api.toggle());          // 主按钮：开 / 停
    const reveal = createReveal();                            // 揭晓：奖项 / 名字 / 附注
    root.append(picker.node, reveal.node, action.node);

    return {
      begin({ labels }) {},                       // 开始转
      reveal({ winners, prizeName, focus }) {},   // 停下，写上结果
      reset() {},                                 // 撤销后回到待机
      update(view) {},                            // 每次状态变化都调：列表、计数、按钮都在这儿刷新
      destroy() {},                               // 清定时器、动画帧、观察者
    };
  },
};
```

然后在 [`site/src/stages/index.js`](./site/src/stages/index.js) 的 `STAGES` 数组里加一行 `import` 与一项。
列表、配置控件、数据校验、舞台装载都从那个数组读，别的地方不用改。

基于 lucky-canvas 的玩法不用写外壳：`stages/lucky.js` 的 `defineLuckyStage({ id, label, kind, skins, build, styles })`
已经把顶栏、画布、底栏、开停时序写好了，只给 `build({ labels, weights, w, h, skin })` 返回库的配置即可
（`wheel` / `grid` / `slot` 三个形态都这么写）。

要点：

- 引擎与界面只通过 `begin` / `reveal` / `reset` / `update` / `destroy` 打交道；形态不读存档、不抽奖。
- `update(view)` 是唯一的数据来源：`prizes` / `people` / `labels` / `weights` / `spinning` / `revealed` / `batch` / `allDrawn` 都在里面，`view` 的形状见 `site/src/draw/main.js` 的 `view()`。
- `api` 是入口：`toggle()` 开停、`pickPrize(id)` / `pickPerson(id)` 选对象、`undo()` / `voidLast()`、`results()`、`exit()`、`fullscreen()`。
- `begin` 收到的 `labels`：奖品抽人时是人名，人抽奖品时是奖项名；`weights` 是引擎用的那份权重（`剩余名额 × 单位权重`），扇区与签数照它分才和概率一致。
- 揭晓写谁看 `focus`：`'people'` 大字写人，`'prize'` 大字写奖。写反了会让人以为又抽了一次。
- 定时器、`requestAnimationFrame`、`ResizeObserver` 一律走 `createCleanup()`；反复开抽用 `clearTimers()`，`destroy()` 才用 `clearAll()`。
- `mode` 决定这一形态怎么抽：`prize-person`（先定奖项再抽人）或 `person-prize`（每个人抽一个奖）。
- `config` 声明这一形态的旋钮（`range` / `select` / `switch`），主页按它渲染，抽奖页把整份配置交给 `create`。`batch`（一次抽几人）只在 `prize-person` 形态里有。
- 样式放在同目录的 `<id>.css`，通过 `styles` 导出；`stages/index.js` 会在启动时统一挂上。
- 尺寸一律用容器单位（`cqw` / `cqh`）：舞台是容器，主页预览框也是容器，同一份样式两边都对得上。

## 目录

| 路径 | 内容 |
| --- | --- |
| `tool.json` | 工具箱清单（`kind: h5`，`tags: ["scene"]`） |
| `site/index.html` | 主页外壳 |
| `site/draw.html` | 抽奖页外壳（独立入口） |
| `site/styles.css` | 主页样式与各套主题的配色变量 |
| `site/draw.css` | 抽奖页外壳：铺满、容器查询、揭晓结构、结果弹窗 |
| `site/src/main.js` | 主页：列表、详情、弹窗、导入导出 |
| `site/src/draw/main.js` | 抽奖页：舞台、键盘、结果 |
| `site/src/data.js` | 抽奖 / 名单 / 奖品三类数据、迁移、命名 |
| `site/src/engine.js` | 抽奖引擎：池、抽样、名额、撤销（纯函数） |
| `site/src/workbook.js` | xlsx 读入与导出（抽奖包、名单、奖品、结果） |
| `site/src/xlsx.js` | 最小 xlsx 读写（ZIP + OOXML），与 `study-hall` 同源 |
| `site/src/store.js` | localStorage 存取与旧存档迁移 |
| `site/src/theme.js` | 主题清单、记忆与切换 |
| `site/src/stages/` | 形态：一个形态一屏（js + css + mode + config），登记在 `index.js`。`lucky.js` 是 lucky-canvas 的装配层与形态工厂；`wheel` 大转盘、`grid` 九宫格、`slot` 老虎机（都是人抽奖品） |
| `site/vendor/` | lucky-canvas@1.7.27 整包（Apache-2.0），含 LICENSE 与 package.json 备查 |
| `tests/engine.test.mjs` | 引擎单测 |
| `tests/stages.test.mjs` | 形态登记与配置 |
| `tests/data.test.mjs` | 数据迁移、同名、抽奖包往返 |

## 验证

```bash
npm test          # 引擎、形态、数据与 xlsx 往返
```

页面不依赖构建。要本地看，在 `site/` 下起一个静态服务即可：

```bash
python3 -m http.server 8787
```

## 发布

随工具箱发布：目录放在工具仓库的 `tools/lottery/`，发布器只收 `tool.json` 与 `site/`。`package.json` 与 `tests/` 仅用于本机跑测试，不进发布包。
