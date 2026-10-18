# 抽奖台（lottery）

导入一份 xlsx 就能开抽。同一份数据有两种抽法：

- **奖品抽人**：选一个奖项，从没中过的人里抽 N 个。适合年会、晚会，画面是大屏。
- **人抽奖品**：指定一个人或按名单顺序，按各奖项剩余名额加权抽一个奖。适合摊位、抽奖箱。

主页只管管理，抽奖页是独立入口：左边列表（抽奖 / 名单 / 奖品），右边详情；点“开始抽奖”进入 `draw.html`。

## 用法

1. **新建**：左上角 `+` 先弹菜单——`从 xlsx 导入` 或 `新建`。抽奖、名单、奖品三类都是这个入口。
2. **抽奖**：新建时选名称、名单、奖品与形态。名单与奖品会复制到这场抽奖，之后改素材不影响它。
3. **形态决定怎么抽**：滚动名单 / 抽卡 / 球体是“奖品抽人”，转盘是“人抽奖品”；每次抽几人也属于形态自己的配置。不重复中奖是整场的设置。
4. **开始 / 继续 / 重新抽**：主按钮在右侧栏最下方。没有记录时是“开始抽奖”，抽过一半是“继续抽奖”，抽完是“查看结果”；“重新抽奖”清空记录，名单、名额与配置保留。
5. **结果**：开抽后出现在最上面，一格一个人（姓名 / 奖项 / 时间）。「明细」里同样是卡片，可勾选任意几条一起撤销，或全选撤销；撤销只去掉记录，人回到池子里。
6. **奖项与参与人**：方格排布，两行以内直接显示，多出来点“展开全部”。点“编辑”可以改名、调名额、补人、删人（名额改不到已经抽出去的数量以下）。
7. **操作**：右侧「操作」里是一排小按钮——导入、导出、重新抽奖、删除抽奖；主按钮在右下角。
8. **主题**：左下角标签栏最右边的齿轮打开设置，可在纸白、暖沙、墨绿、靛蓝、石墨之间切换。只有主页换配色，抽奖页始终是暗场；前四套跟随系统深浅，石墨固定为暗。

抽奖页占满整屏，键盘：空格开 / 停，↑↓ 换一行，退格撤销，Delete 作废，Esc 只退全屏（右上角“退出”回主页）。状态存在浏览器 localStorage，刷新不丢。

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
- 一次抽几人在详情里改；名额或人不够就按能抽的抽。
- 人抽奖品时，配额抽完的奖项权重为 0，自然退出抽签；全部抽完就停下。抽奖页默认按名单顺序取下一位，也可以点任意一行。
- 嵌在工具箱里时浏览器不给 iframe 全屏权限，“全屏”会提示一句；舞台本身就是铺满视口的一层。
- 解析、存储、导出都在本机浏览器里完成，没有服务端，也不上传文件。
- 没有账号、多人同步与扫码加入。换设备用导出的 xlsx 带走。

## 加一种抽奖形态

一个形态就是一个文件，默认导出 `{ id, label, mode, styles, config, create }`：

```js
// site/src/stages/marquee.js
import { createPlate, el, mount } from './common.js';

export default {
  id: 'marquee',
  label: '跑马灯',
  mode: 'prize-person',
  styles: new URL('./marquee.css', import.meta.url).href,
  config: [
    { key: 'rows', label: '行数', type: 'range', min: 12, max: 40, step: 2, value: 26 },
  ],

  create(host, config) {
    // 把画面挂进 host；只用这里拿到的 DOM，不要碰外面的状态
    const root = mount(host, 'stage-marquee');
    const plate = createPlate();
    root.append(plate.node);

    return {
      begin({ labels }) {},   // 开始转
      reveal({ winners, prizeName, focus }) { plate.show({ winners, prizeName, focus }); },
      reset() {},             // 回到待机
      destroy() { host.replaceChildren(); }, // 清定时器、动画帧、观察者
    };
  },
};
```

然后在 [`site/src/stages/index.js`](./site/src/stages/index.js) 的 `STAGES` 数组里加一行 `import` 与一项。
下拉选项、配置控件、数据校验、舞台装载都从那个数组读，别的地方不用改。

要点：

- 引擎与界面只通过 `begin` / `reveal` / `reset` / `destroy` 打交道；形态不读 `run`、不抽奖。
- 揭晓统一用 `createPlate()`；`plate.show({ winners, prizeName, meta, focus })`。`focus: 'prize'` 时大字写抽到的奖（人抽奖品用）。
- `begin` 收到的 `labels`：奖品抽人时是人名，人抽奖品时是奖项名。
- 定时器、`requestAnimationFrame`、`ResizeObserver` 一律走 `createCleanup()`，`destroy()` 里 `clearAll()`。
- `mode` 决定这一形态怎么抽：`prize-person`（先定奖项再抽人）或 `person-prize`（每个人抽一个奖）。
- `config` 声明这一形态的旋钮（`range` / `select` / `switch`），主页按它渲染，抽奖页把整份配置交给 `create`。`batch`（一次抽几人）只在 `prize-person` 形态里有。
- 样式放在同目录的 `<id>.css`，通过 `styles` 导出；`stages/index.js` 会在启动时统一挂上。

## 目录

| 路径 | 内容 |
| --- | --- |
| `tool.json` | 工具箱清单（`kind: h5`，`tags: ["scene"]`） |
| `site/index.html` | 主页外壳 |
| `site/draw.html` | 抽奖页外壳（独立入口） |
| `site/styles.css` | 主页样式与各套主题的配色变量 |
| `site/draw.css` | 抽奖页样式（暗场） |
| `site/src/main.js` | 主页：列表、详情、弹窗、导入导出 |
| `site/src/draw/main.js` | 抽奖页：舞台、键盘、结果 |
| `site/src/data.js` | 抽奖 / 名单 / 奖品三类数据、迁移、命名 |
| `site/src/engine.js` | 抽奖引擎：池、抽样、名额、撤销（纯函数） |
| `site/src/workbook.js` | xlsx 读入与导出（抽奖包、名单、奖品、结果） |
| `site/src/xlsx.js` | 最小 xlsx 读写（ZIP + OOXML），与 `study-hall` 同源 |
| `site/src/store.js` | localStorage 存取与旧存档迁移 |
| `site/src/theme.js` | 主题清单、记忆与切换 |
| `site/src/stages/` | 形态：一个形态一个文件（js + css + mode + config），登记在 `index.js` |
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
