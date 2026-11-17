# 问题域画板 · UI 走查

## 收口 REV3
走查基准：`01-product.md`(293) / `02-design-system.md`(218) / `03-ui.md`(158)；实现 `src-web/src/`；产物 `site/` 未逐屏核。
验证手段：静态读码 + 六份样式表全量扫描 + `file:line` 对账。**测试未能执行**：`npm test` 在沙箱内 `spawn EPERM`（esbuild 启子进程被拒，exit 1），`node scripts/render.test.mjs` 报 `MODULE_NOT_FOUND`（仓库无 `scripts/`）。故下文出现的「测试名」只作为规则存在的证据，不是用例通过的证据。

**结论：有 1 条必须先修（R1，窄屏抽屉定位规格差），无功能级漏项；改完 + 补跑测试即可提交。** REV2 的 3 条「改一半」＝ M6 关闭 / M7 关闭 / M9 只剩 R1；REV2 的窄屏回归（N3）真修好；REV2 列的 9 条新问题全部关闭。

### 必须先修（1）

| 编号 | 问题 | 证据 | 改哪里 |
| --- | --- | --- | --- |
| R1 | 窄屏抽屉仍是 `position:absolute`，稿写死 `position:fixed` | `views.css:41`（在 `@media (max-width:1199px)` 块内）；稿 `03-ui.md:92`「详情变覆盖式抽屉（`position:fixed` 贴右、宽 340、`--pd-sh-2` 浮起）」 | 代码 `views.css:41` 改 `fixed`；或稿 03:92 改 `absolute`（现方案只覆盖 `.content`，不盖状态行与左列）。Router 若判「只覆盖内容区」更合理，本条降级为改稿一句 |

### REV2 三条「改一半」复核

| 编号 | 判定 | 证据 |
| --- | --- | --- |
| M6 | 关闭（靠改稿对齐） | `01-product.md:185` 已改成「实体行 `＋` = 新建同级实体（行为与约束在右栏详情里建，不在树上建）」＝ `03-ui.md:101`「`＋` 直接建同级节点」；`02:5` 摘要同一句。实现侧不动：`Tree.tsx:203–213`、`treeMenus.ts:21–28` |
| M7 | 关闭 | 内距 `canvas.css:179` `padding:var(--pd-sp-4)`（`02:55` = 24px）；宽 `canvas.css:180` `width:300px`；主按钮 `canvas.css:191–197` `background:var(--pd-accent);color:var(--pd-bg-2)` 且 `ProblemCanvas.tsx:167` 用的是 `.primary-btn`；稿 `02:132` 三项逐字对上 |
| M9 | 关闭 2/3，剩 R1 | 左列 240 / 抽屉宽 340 / `--pd-sh-2` 都对（`views.css:36,45,47` ↔ `03:92`）；回归已修（下节）；只差 `position` |

### 回归（N3 · 窄屏收起详情）判定：真修好

`views.css:61–65` 在媒体块内写 `.app[data-right="off"] .detail, .app[data-right="off"] .detail-scrim{visibility:hidden;pointer-events:none}`——`visibility` 沿子树失效（遮罩同时不吃事件），`pointer-events:none` 是显式兜底。宽屏不受影响：该规则只在 `views.css:35` 的媒体块里，块外 `views.css` 无 `visibility:hidden`，`:20` 在宽屏只把栅格列收 0。展开可恢复：选择器只匹配 `[data-right="off"]`，回到 `on` 即失效。状态单一来源 `App.tsx:67`；遮罩点击 `App.tsx:81–87`（`setDetailOpen(false)`）。测试名：`uiReview.test.ts:162`「⑤ 窄屏收起详情：抽屉与遮罩一起隐藏（REV2 N3 真回归）」（`:169–176` 三条断言：必须 `visibility:hidden`、`[data-right="on"]` 不许隐藏、媒体块外不许出现该规则）；`:179`「⑤ 状态函数：收起点遮罩 / `]` 都把 data-right 变成 off」。**两者均未执行**。

### REV2 九条新问题

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| N1 340 硬编码 | 关闭 | `views.css:4` `--pd-detail-w:340px` 为唯一来源，全样式表 `340px` 仅此 1 处；`views.css:27,67,68` 均引用变量 |
| N2 把手位置 / aria | 关闭（留 1 小项） | 稿已对齐实现：`03:69`「`.hd` 长在详情头部、不单独占缝隙」↔ `DetailPanel.tsx:97–106`。留痕：`App.tsx:110–118` 的 `reopen-detail` 只有 `title`、无 `aria-label`，而同屏 `App.tsx:94,104` 两枚把手都有 |
| N3 窄屏真回归 | 关闭 | 见上节 |
| N4 工具条第 5 枚 | 关闭（改稿） | `02:128` / `03:68` 都写「五枚都在…第 5 枚开合小地图」↔ `ProblemCanvas.tsx:196–204` |
| N5 缩放范围 | 关闭（改稿到 30%–250%） | `03:79`、`02:128` ↔ `ProblemCanvas.tsx:131–132`（0.3 / 2.5） |
| N6 快捷键表 | 关闭 | `03:85–87` 补了 `Ctrl+Y` / `Shift+N` / `Enter` ↔ `App.tsx:44–48`、`Tree.tsx:403–405`、`InlineInput.tsx:32` |
| N7 右键菜单 | 关闭（稿里已删） | `03-ui.md` 全文「右键」0 命中；`§2.8` 只剩四处入口（`03:98–104`） |
| N8 裸 `data-*` 选择器 | 关闭 | 六份样式表无值形态 `[data-x]` 0 命中；四处已改 `="true"`：`canvas.css:49,50,152,164`；`uiReview.test.ts:226–258` 有断言 |
| N9 `.stage-hint` / 1px 绕过 | 关闭 | `.stage-hint` 全仓 0 命中；`canvas.css:164` 已改 `box-shadow:0 0 0 1.5px var(--pd-red-3)`，全表无 `0 0 0 1px` |

### 新增回归扫描（六份样式表全量 grep）

| 项 | 结果 |
| --- | --- |
| 写死颜色 | 裸 hex 仅 `tokens.css`（两套主题令牌），其余 5 份 0 处 |
| 非零 border | 1px / 2px / 3px 边框 0 命中；只有 `border:0`（`flow.css:73`、`views.css:27`） |
| `!important` | 0 处 |
| `position:fixed` | 0 处（与 R1 同源：抽屉本应是唯一一处） |
| `z-index` | 2/3 画布层 < 4 窄屏抽屉 ≤ 20 行菜单 < 30/31/32 导出三级，无越界压层 |
| 拖拽元素上的 `transition` | 仅 `flow.css:77` 对 `.react-flow__handle` 做 `opacity .12s`，不碰 `transform/left/top`，不影响拖拽 |

### 抽查 20 条：19 通过 / 1 不通过

1 缩放 30%–250%（`ProblemCanvas.tsx:131–132`）·2 工具条 5 枚（`:183–204`）·3 窄屏隐「图」（`canvas.css:293`）·4 空态宽 300（`canvas.css:180`）·5 空态内距 24（`:179` + `02:55`）·6 主按钮主色底反白（`:191–197`）·7 空态标题「还没有核心问题」（`ProblemCanvas.tsx:165`）·8「导入 JSON」（`:170–171`）·9 检查行「检查 N 条 · X 错误 Y 警告」（`checkText.ts:8`）·10 `[` 收画板（`App.tsx:55–58`）·11 `]` 收详情（`:49–53`）·12 `Ctrl+Y`（`:44–48`）·13 `N` / `Shift+N`（`Tree.tsx:403–405`）·14 `Enter` 提交（`InlineInput.tsx:32`）·15 `Esc` 取消（`:36`、`Tree.tsx:406`）·16 详情 340 单列（`views.css:4,16`）·17 收起双属性（`:20,24` + `App.tsx:67–68`）·18 窄屏左列 240（`views.css:36`）·19 网格 24px 点阵（`ProblemCanvas.tsx:157`）·20 把手 24 / `opacity:.4` / 无描边（`components.css:79`、`views.css:27`）。**不通过 = 窄屏抽屉 `position:fixed`（R1）**。
未计入 20 条（未核）：`02:113`「17 个组件」未逐项枚举；`02:119` 状态行高 44 / 无背景本轮未读样式；`01:60` 解域空态文案与 `02:132` / `03:103` 三处措辞不一，实现取值未核。
## 复审 REV2

复审基准：`02-design-system.md`（215 行）/`03-ui.md`（154 行）——两份稿都已被改；实现 `src-web/src/`；产物 `site/` 与源码时间戳同为 19:15（未逐屏核内容）。
验证手段：静态读码 + CSS 规则对账 + `npm test`（17 个用例文件 + `render`/`edges` 两脚本，exit 0；其中 `uiReview.test.ts` 5 例、`render.test.mjs` 4 例、`edges.test.mjs` 6 例全绿）。

**结论：关闭 7 条 / 仍存在 0 条 / 改了一半 3 条（M6 · M7 · M9）。** 核心四项（`[` 收放、保存失败、解域入口、空态卡）都真的落地了，不是自述；剩下三处差的是规格细节与窄屏一条真回归。另列新引入/遗留 9 条、待定分歧 4 条。

### M1–M10 逐条复核

| 编号 | 判定 | 现在的实现证据 | 与稿是否一致 |
| --- | --- | --- | --- |
| M1 `[` 收画板 | 已关闭 | `App.tsx:55–58` `[` → `toggleCanvas()`；`commands.ts:336–341`；`App.tsx:19–24` 注释已改成「两者互斥」，不再是「本轮不做」 | 03:83 ✓ / 02:109 ✓ |
| M2 状态 · 列宽 0 · 把手 · 互斥 | 已关闭 | `data-canvas` 读真实状态，非硬编码：`App.tsx:68`、`ProblemCanvas.tsx:117`；列宽收 0：`views.css:22` + `.stage{display:none}` `:23`；把手 `.hc` 可点：`App.tsx:89–109`、`views.css:24,26`；互斥：`commands.ts:329`（收详情→`canvasOpen:true`）、`:337`（收画板→`detailOpen:true`），两块不可能同时 off | 03:43,69,70 ✓；02:109,194 ✓；`uiReview.test.ts:39,62` 两例通过 |
| M3 检查行两档 | 已关闭 | 文案 `checkText.ts:8`「检查 N 条 · X 错误 Y 警告」；圆点 8px `components.css:51`；两档色 `canvas.css:273–274`（`--pd-red-3` / `--pd-amber-3`）；口径同源：`CheckFooter.tsx:14–16` 与 `DetailPanel.tsx:198–201` 都读 `doc.checks.findings` | 02:127、03:51、03:127 ✓ |
| M4 保存失败态 | 已关闭 | `saveLabel.ts:12–16` 三态含「⚠ 保存失败（点击重试）」+ `tone:'error'`；`StatusBar.tsx:74–83` 失败态渲染 `<button className="saved-retry" onClick={retrySave}>`；`retrySave` → `bootstrap.ts:27–29` → `persistence.ts:166–169`（`readOnly=false; flush()`），写成功后 `onSaved → markSaved` 回「✓ 已保存」；失败点上报见 `persistence.ts:153` | 03:112、02:117 ✓；`uiReview.test.ts:101` 用例覆盖「注入失败 → 点重试 → 已保存」 |
| M5 9 类节点形状 | 已关闭 | 稿已收窄为「只 2 类卡片」：02:149,156 + 03:67；实现只有 `nodes.tsx:26` 问题卡 / `:73` 实体卡，其余 5 类以问题卡底部胶囊呈现（`canvas.css:32–47`；`toFlow.ts:206–207` 截 3 + `+N`；`nodes.tsx:60`） | 02:149,156 ✓ —— 冲突靠改稿解决，不是补 5 类组件 |
| M6 解域建入口 | 改了一半 | 实体行 `＋`：`Tree.tsx:203–213` → `beginEntityDraft`；实体行菜单「新建关系」：`treeMenus.ts:21–28` → `startConnect`；关系行 `⋯`：`treeMenus.ts:51–66`、`Tree.tsx:301–310`（重命名 / 删除） | 与 03:97 一致（`＋` 直接建同级）；**与 01「实体 ＋ → 行为 / 约束二选一 + 一条边」不一致**（01 原文本次未找到，UNVERIFIED）。差的就是这条语义 |
| M7 问题域空态卡 | 改了一半 | 卡真实出现：`ProblemCanvas.tsx:163–181`（`questionCount===0`）；主按钮 `beginDraft(null)`（`:167`）、次按钮 导入 JSON（`:170–172` + `onFile :92–109` 过 `loadWorkspaceText` 四道闸）；双击不穿透：`:83` `closest('.emptycard')` 直接 return | 02:130 差两处：`.emptycard` `padding:20px`（`canvas.css:178`）不是 `--pd-sp-4`(24)，且**没有 `width:300`**；主 / 次按钮都用 `.ghost-btn`（`ProblemCanvas.tsx:167,170`），稿要主按钮 `--pd-accent` 底 |
| M8 画布网格 | 已关闭 | `ProblemCanvas.tsx:157` `BackgroundVariant.Dots gap=24 size=1 color="var(--pd-line-1)"`（解域同，`SolveFlowCanvas.tsx` 同写法） | 02:188 已改为「24px 点阵」，原「4/5 虚线」作废（03 §6 同步）✓；「不透明度 ≤.6」靠令牌值表达，未另加 opacity |
| M9 窄屏 | 改了一半 | 左 240：`views.css:33`；抽屉宽 340 + `--pd-sh-2`：`:37–45`；遮罩可关：`:46–52` + `App.tsx:81–87`（`onClick={() => setDetailOpen(false)}`）；「已保存」文字隐去：`components.css:148–151` | 03:88 三件 ✓；**差两处**：① 稿要求 `position:fixed`，实现 `position:absolute`（`views.css:38`）；② 窄屏收起详情后覆盖层不消失——样式表无 `.app[data-right="off"] .detail` 隐藏规则（`data-open` 在 CSS 里 0 命中，`DetailPanel.tsx:96` 的 `data-open` 没人读），`views.css:35` 只改栅格列 |
| M10 连线提示条 | 已关闭 | 文案 `SolveFlowCanvas.tsx:194`「先点起点实体，再点终点实体 · Esc 取消」与稿逐字一致 | 03:86,100、02:131 ✓；样式 `canvas.css:124–141`：高 32、`--pd-tint-bg` 底、`border:0` |

### 新引入问题（9 条）

| 编号 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| N1 | 画板把手位置写死按「详情展开」算：`right:calc(340px + 6px - 12px)`，详情收起时把手中途悬在画板里 | `views.css:24`；对照 `views.css:15` `.reopen-detail` 才贴右沿 | 用 `data-right` 分支给两套 right，或让把手挂在 `.content` 的边界网格列上 |
| N2 | 详情把手 `.hd` 长在详情卡头部，不在「画板与详情之间的 12px 缝隙」；展开把手 `reopen-detail` 缺 `aria-label` | `DetailPanel.tsx:99–106`（`title="收起详情（]）"`）、`App.tsx:110–118` | 按 03:69 把 `.hd` 挪到缝隙处、`left` 贴自己边界；补 aria-label |
| N3 | **窄屏真回归**：点「收起详情」后 `.detail`（absolute 覆盖层）仍盖在画板上 | `views.css:35` 只改 `grid-template-columns`；`components.css:72` `.detail{display:flex}` 无 off 分支；CSS 里 `data-open` 0 命中 | 加 `@media` 内 `.app[data-right="off"] .detail{display:none}`（或读 `data-open`） |
| N4 | 画布工具条多第 5 枚「图」按钮（缩略图开关），稿只声明四件 | `ProblemCanvas.tsx:196–203`；02:126「四件都在」、03:68 | 要么在 02/03 补声明，要么移出工具条 |
| N5 | 滚轮缩放范围与手势表不符：实现 30%–250% | `ProblemCanvas.tsx:131–132`、`SolveFlowCanvas.tsx:113–114`；03:79 写「25%–200%」 | 见 D3 |
| N6 | 快捷键表与实键非一一对应：表里无 `Ctrl+Y` / `Shift+N` / `Enter`，实现都有 | `App.tsx:44–48`（Ctrl+Y）、`Tree.tsx:403–405`（N / Shift+N）、`StatusBar.tsx:107` title 自称 Ctrl+Y；03:84 | 补表或删键 |
| N7 | 稿声明「右键 = 同一个菜单（新建问题 / 粘贴 / 适配画布）」，实现没有 | `grep onContextMenu|contextmenu` 在 `src-web/src` 0 命中；03:98 | 旧账：要么实现，要么从稿里删这句 |
| N8 | 裸 `data-*` 属性选择器仍有 4 处（FIX6 的坑只差一步） | `canvas.css:49` `[data-dragging]`、`:50` `[data-core]`、`:152` `[data-connect-source]`、`:163` `[data-unsupported]`；当前 JSX 全写 `|| undefined`（`nodes.tsx:28,29,75,76,122`）所以不误命中 | 统一成 `="true"`，别靠「调用方记得写 undefined」 |
| N9 | 死代码 + 1px 口径绕过：`.stage-hint` 全仓 0 引用；`.tag[data-unsupported]` 用 `box-shadow:0 0 0 1px` 画细线，绕开 §9.3 的 `border` 计数 | `components.css:71`；`canvas.css:163` | 删 `.stage-hint`；细线改 1.5px 环或确认豁免 |

（反向核对：`styles/` 除 `tokens.css` 外裸 hex **0 处**、非零 `border` **0 处**——本次改动没有再引入硬颜色与 1px 边框。）

### 待定分歧（4 条）

| 编号 | 分歧 | 核实结果 | 建议 |
| --- | --- | --- | --- |
| D1 | `.canvas-hint` 高 28 vs `.modebar` 高 32 | 不是分歧：02:131 同一行分别写两件（提示胶囊 28、连线说明条 32），实现在 `canvas.css:112`/`:131` 与稿逐字相符 | 保持现状，不改稿 |
| D2 | 窄屏左栏 220 vs 240 | 分歧已消失：02:192 与 03:88 现在都写 240，实现在 `views.css:33` 也是 240；两份稿 grep「220」0 命中 | 以 **240** 为准（与实现一致；340 抽屉下 220 反而更挤） |
| D3 | 缩放范围：03:79「25%–200%」vs 实现 30%–250% | 两域一致取 `minZoom=0.3 / maxZoom=2.5`（`ProblemCanvas.tsx:131–132`、`SolveFlowCanvas.tsx:113–114`） | 建议改稿到 **30%–250%**（与库默认手感一致，200% 上限放不小卡片细节）；若要守稿就改两处常量 |
| D4 | `03:97`「实体行 ＋ = 建同级实体」vs `01`「实体行 ＋ = 行为 / 约束二选一 + 一条边」 | 实现跟 03；01 原文本次在 `docs/design/` 下未找到（UNVERIFIED） | Router 指定以 01 还是 03 为准；若以 01 为准，M6 未关闭 |

---

## 归档 REV1（原 §1–§5 原样保留）


走查基准：`02-design-system.md`（219 行）/`03-ui.md`（140 行）/`01-product.md`（291 行），`archive-v1/` 不计。
实现基线：`src-web/src/`（读取时未改动任何文件）。

## §1 结论

**有 10 个必须修的漏项，当前不可交付。** 其中 3 条直接命中用户已踩过的坑（`[` 收画板、检查行状态、空态/收起链路），轴心问题是「稿里写了状态，实现只做了主干」。

## §2 必须修（10 条）

| 编号 | 类别 | 稿中要求 + 行号 | 实现现状 + 证据 | 建议改哪里 |
| --- | --- | --- | --- | --- |
| M1 | ① 缺失 | `[` 收画板：02:109「收起只剩把手 + `[` `]`」、02:198、03:68–69「触发 = 画板把手 / `[` 键」 | 根本没实现，且注释写死不做：`src/App.tsx:45`「`[` 收画板本轮不做」，45–48 只在画板已收起时 `preventDefault`，永不切状态 | `App.tsx:41–48` 加 `[` → `toggleCanvas()`；`store/commands.ts` 补与 `toggleDetail` 对称的命令 |
| M2 | ① 缺失 | 画板可收到 0 + 互斥：03:43、03:66–69（`body[data-canvas="off"]`、`.hc` 把手 left:-18、24px、静止 opacity .4）；02:198 | `data-canvas="on"` 硬编码两处（`App.tsx:55`、`ui/ProblemCanvas.tsx:83`）；全仓无 `.hc`/画板把手节点；CSS 只有详情收起规则 `canvas.css:276`，无 `.app[data-canvas="off"]`；互斥规则无处落地 | `App.tsx:63–76` 增画板把手 + `data-canvas={…}`；`views.css` 加收起列宽规则；`commands.ts` 实现「要收一块先把另一块放回」 |
| M3 | ④ 文案/手势 + ③ 状态 | 检查行文案「检查 3 条 · 2 警告 1 提示」（解域「检查 1 条 · 1 提示」）02:127、03:51；圆点 8px、警告 `--pd-amber-3`、提示 `--pd-amber-4` 03:51 | 文案用「错误」不用「警告」、且按 severity 取名，编译期无「提示」档：`ui/CheckFooter.tsx:15–17` 输出 `检查 N 条 · X 错误 Y 提示`；圆点复用 `.dot` 6px（`styles/components.css:27`）；只有 `s-error/s-warning`，`s-warning`=`--pd-amber-3`（`styles/canvas.css:272–273`），无 `--pd-amber-4` 分支；为 8px 准备的 `.check-dot`（`components.css:50`）是死代码没人用 | `CheckFooter.tsx` 改成稿中两档措辞（警告/提示）并区分 success 圆点色；`components.css` 给 `.check-footer .dot` 8px，补 amber-4 档 |
| M4 | ③ 状态覆盖 | 保存失败态：03:112「「已保存」位右移为「保存中 / 失败」，失败用 `--pd-red-3` 点，不弹模态框」 | 只有两态，无失败：`ui/StatusBar.tsx:71` `saved ? '✓ 已保存' : '保存中…'`；落盘失败被有意吞掉：`store/persistence.ts:162` 注释「失败静默（04 §3.1）」 | `docStore` 暴露 `saveError`，`StatusBar.tsx:70–72` 加第三态 + red-3 圆点 |
| M5 | ① 缺失 | 9 类节点各有形状：02:146–160（`actor` 胶囊/`scene` 折角/`concept` 152×40/`rule` 顶部 4px 色条/`event` 八边形 clip-path/`constraint` 淡色贴条 200×32） | 只实现 2 类：`ui/flow/nodes.tsx:144` `nodeTypes = { question, entity }`；`styles/canvas.css`、`flow.css` 内无 `clip-path`、无 `.actor/.scene/.concept/.rule/.event/.constraint` 选择器（全文已读）；而 5 类节点确实可被创建（`ui/DetailPanel.tsx:413` → `store/commands.ts:524 createElementLink` → `addLinkedElement`），创建后在画布上无卡片长相 | 要么补 5 类节点组件与 §4 尺寸/形状，要么把 02 §4 收窄为「问题=卡、元素=胶囊」并与 01 对齐（需 Router 定夺，见 NEXT） |
| M6 | ① 缺失 | 解域行菜单 `新建关系 / 重命名 / 删除`：03:83；行内 `＋` 建子级：03:83、01:185（实体行 `＋` → 行为/约束二选一 + 一条边） | 实体行菜单只有两项：`ui/Tree.tsx:213–222`（重命名 / 删除实体），无「新建关系」；实体行 `row-actions` 只有 `⋯`（`Tree.tsx:198–210`），无 `＋`；问题行反而有 `＋`（`Tree.tsx:77–88`，title=新建子问题） | `Tree.tsx` 实体行补 `＋`（行为/约束下拉）与菜单项「新建关系」→ `startConnect()` |
| M7 | ① 缺失 | 问题域空态引导卡：02:130（宽 300、内距 sp-4、圆角 12、`还没有核心问题` + `＋ 新建核心问题` / `导入 JSON`，树与画布同时为空才出现）、03:85 | 画板侧没有空态卡：`ui/ProblemCanvas.tsx` 全文无 `emptycard`（对比解域 `ui/SolveFlowCanvas.tsx:159–167` 有）；问题域只有左树一句 `Tree.tsx:395–397`，且没有「新建核心问题 / 导入 JSON」按钮 | `ProblemCanvas.tsx` 补 `.emptycard`（复用 `canvas.css:168`），空态判定与 `Tree` 同源 |
| M8 | ④ 手势/视觉 | 画布网格 = 4px 实 / 5px 空的极淡虚线，`--pd-line-1`、stroke-width 1、opacity .55：02:192（§6.7）、03:130 | 画的是圆点阵：`ui/ProblemCanvas.tsx:120`、`ui/SolveFlowCanvas.tsx:154` 用 `BackgroundVariant.Dots gap=24 size=1`；`canvas.css:4–12` 的 24px 渐变网格被 `flow.css:42` `.stage[data-flow="on"]{background-image:none}` 关掉 | 换成 `BackgroundVariant.Lines` 或自绘 4/5 虚线 pattern（`flow.css` 里给 `.react-flow__background` 打 dash） |
| M9 | ① 缺失 | 窄屏 <1200：左 220、详情变覆盖式抽屉（fixed 贴右、宽 340、sh-2）、状态行隐去「已保存」：03:72–74 | 只换了列宽、且宽度是 300 不是 340：`styles/views.css:17–19`；无 `position:fixed` 抽屉，无 `.saved` 的媒体查询隐藏（`components.css:59` 无 media 覆盖） | `views.css` 媒体块内把 `.detail` 改 fixed 抽屉 + `components.css` 在该档隐藏 `.saved` |
| M10 | ④ 文案/手势 | 连线提示条文案 `先点起点实体，再点终点实体 · Esc 取消`（03:86）；条本身 `--pd-tint-bg` 底、高 32、无边框（02:131） | 文案不同：`ui/SolveFlowCanvas.tsx:194`「从实体两侧的圆点拖到目标实体 · 或按左树的顺序点两个实体 · Esc 取消」；样式高 28 + `--pd-bg-3` 底：`styles/canvas.css:124–134`（稿要求 32 + tint 底） | 改文案到稿中一句；`.modebar` height 32、background `var(--pd-tint-bg)` |

## §3 建议修（9 条，非阻塞）

| 编号 | 类别 | 稿中要求 + 行号 | 实现现状 + 证据 | 建议改哪里 |
| --- | --- | --- | --- | --- |
| S1 | ② 稿中无 | 状态行右侧只有「✓ 已保存」+ 主题演示：02:108、02:117、03:60 | 多出导出菜单与撤销/重做：`ui/StatusBar.tsx:80–102`（`ExportMenu`、`.hist-btns` 两个 24px 钮） | 要么移出状态行，要么在 02/03 补声明（导出入口 01 §8 有需求但版式稿没给它位置） |
| S2 | ③ 状态覆盖 | `prop-row` 悬停（可编辑）淡底胶囊：02:121 | `.prop-row` 只有默认与 focus：`styles/canvas.css:198–222`，全文无 `.prop-row:hover` | 加 hover 底色（`--pd-tint-bg`/`bg-3`），或删掉稿中这句 |
| S3 | ① 缺失 | 组件 8 `toast`：高 36、圆角 10、`bg-3`+`sh-2`、底部居中、3s 消失、警告/错误圆点：02:124 | 全仓无 toast：`grep toast ui/*.tsx styles/*.css` 零命中；导出提示借用 `.export-msg`（`styles/components.css:141`，状态行内飘出，不居中、不自动消失） | 抽一个 toast 容器挂 `App`，导出/导入/保存失败复用 |
| S4 | ② 边界 | 样式文件职责：节点/边视觉归 `components.css`，`tokens/base/components/views` 四件：02:205–208 | 多出两个文件且承载了 §3/§4 视觉：`styles/canvas.css`（288 行）、`styles/flow.css`（160 行） | 02 §8 表补这两行职责，或把节点/边样式并回 components.css |
| S5 | ④ 文案 | 主题演示写「深/浅」（顺序）且 `title="演示用"`：03:60 | 顺序是「浅 深」、无 title：`ui/StatusBar.tsx:72–79`（先 light 后 dark，按钮无 title） | 按稿调顺序并补 title，或改稿 |
| S6 | ③ 空态规格 | 空态：图标 24 + 主文案 + 怎么开始，内距 sp-4、宽 ≤240：02:123；空态引导卡宽 300、内距 sp-4、主按钮 + 次按钮：02:130 | 解域空态卡只有两句字 + 一个按钮，内距 20px、无图标、无宽 300、无次按钮：`ui/SolveFlowCanvas.tsx:160–166`、`styles/canvas.css:168–184` | 补 `.emptycard` 的宽/内距/图标；问题域补卡时一起做 |
| S7 | 文档冲突 | 左栏行高：02:118 写 `nav-item` 高 32；03:50 写 30px 胶囊 | 实现取 30：`styles/components.css:21`（`.row{height:30px}`）→ 按 03 判通过，但两稿冲突 | 在 02 删掉 `nav-item` 行或把它改成 30，避免下次走查两边都对不上 |
| S8 | ③ 状态覆盖 | 检查项「已处理降为 `--pd-fg-3`」：02:122 | 检查项只有默认/hover，无已处理态：`styles/canvas.css:234–248`，`DetailPanel.tsx:268–278` 渲染时无 processed 分支 | 若产品不做「已处理」就删稿中该句 |
| S9 | ④ 文案 | 画布提示胶囊只有一句 `双击空白新建问题 · 或按 N`（可带键帽 `kbd`）：02:131、03:84 | 多出操作说明前缀、没有键帽：`ui/ProblemCanvas.tsx:148`「拖拽平移 · Shift+拖拽框选 · 双击空白新建问题 · 或按 N」；解域同 `SolveFlowCanvas.tsx:197` | 缩回稿中一句，或把平移/框选说明提升进稿 |

## §4 已核对通过（附证据）

| 项 | 证据 |
| --- | --- |
| 两列骨架 264 / 340 / 12px gap / 12px padding | `styles/views.css:2–8,14` ↔ 03:41,66 |
| 状态行 44、无背景/圆角/阴影/下边框；未选中「未选中」12px | `styles/components.css:54,57`、`ui/StatusBar.tsx:67` ↔ 02:117、03:55,62 |
| 节点无描边卡 + sh-1 + hover sh-2 | `styles/canvas.css:16–29,48`、`styles/flow.css:14,48–57`（库默认 border 归 0） ↔ 02:119,189、§9.4 |
| 节点选中 = 1.5px `--pd-accent` 环（box-shadow，非 border） | `styles/canvas.css:54`；静态 DOM 断言「选中/未选中只差 `data-selected`」实跑通过：`node scripts/render.test.mjs` → 4 passed, exit 0 |
| 节点标题长文本截断 | `styles/canvas.css:56–63`（ellipsis/nowrap） |
| 树行 30px 胶囊、hover 淡底、选中 `bg-3`+`sh-1`、无竖条无下划线 | `styles/components.css:21–23` ↔ 03:50、02:118 |
| 行内操作静止 `opacity:0`、行 hover/focus-within 现形 | `styles/components.css:35–36` ↔ 02:129、03:83 |
| 段头 `+` 16×16、常态 `opacity:0`、hover/`focus-within` 现形并转主色 | `styles/components.css:13–16`；解域两个段头：`ui/Tree.tsx:280–329`（实体/关系各一个） ↔ 02:128、03:82 |
| 检查行高 36、`margin:8px`、无底色/阴影/边框、右侧 `›` | `styles/components.css:48–51`、`canvas.css:269`；`ui/CheckFooter.tsx:31–33` ↔ 02:127 |
| 点检查行 → 详情「检查」分组浮 1.5px 主色环 | `ui/CheckFooter.tsx:24 focusChecks` → `ui/DetailPanel.tsx:258 data-focus={ui.detailSection==='checks'}` + `styles/canvas.css:196` ↔ 03:51,110 |
| 检查清空换「6 项检查全部通过」 | `ui/DetailPanel.tsx:199` ↔ 03:111 |
| 详情分组 = 嵌套淡色块 `color-mix(bg-1 32%, bg-2)`、圆角 12、内距 8、无边框 | `styles/canvas.css:188–195` ↔ 02:141、03:70 |
| 属性行 88px 标签 + 28 行高 + 编辑中 1.5px ring | `styles/canvas.css:198–222` ↔ 02:121 |
| 画布工具条 `适配 · − · 100% · +` 四件、`top:46;right:14`、高 30、胶囊、无边框、sh-2 | `styles/canvas.css:79–92`、`ui/ProblemCanvas.tsx:126–137`、`ui/SolveFlowCanvas.tsx:169–181` ↔ 02:126、03:67 |
| 提示胶囊 `bottom:20`、高 28、`pointer-events:none` | `styles/canvas.css:105–121` ↔ 02:131 |
| 键盘 `N` / `Shift+N` / `Esc`（取消草稿+取消连线+关行菜单）/ `]` / `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | `ui/Tree.tsx:348–367`（N、Shift+N、Esc）、`App.tsx:28–44`（撤销重做、`]`）、`ui/SolveFlowCanvas.tsx:72–81`（Esc 退连线）、`ui/InlineInput.tsx:31–47`（Enter/Esc 提交取消） ↔ 03:86、01:220 |
| 撤销/重做禁用态可见 | `ui/StatusBar.tsx:87,97` `disabled={!canUndo()}` / `!canRedo()` + `styles/components.css:77` `:disabled{opacity:.22}` |
| 空态文案（问题树 / 解域树）逐字一致 | `ui/Tree.tsx:396` = 01:47；`ui/Tree.tsx:295` = 01:60 |
| 解域未支撑只在行尾一个红点（C6） | `ui/Tree.tsx:155–163`（`.dot s-error support-none`） ↔ 03:19、01:174 |
| 域切换 52×22、选中 `bg-3`+`--pd-accent`+`sh-1`、单主色不换色 | `styles/components.css:6–8`、`ui/DomainSwitch.tsx:9–26` ↔ 03:47、02:125 |
| 关系线型：`decomposesTo` 直线、`dependsOn` 虚线、`entityRelation` 正交 + 关系名 + 基数 | `node scripts/edges.test.mjs` → 6 passed, exit 0（含真实 `d` 样本与 marker defs） |
| 画布选中/边选中接线走 `ui.selectedId`/`selectedEdgeKey` 单一真相 | `ui/ProblemCanvas.tsx:105–107`、`ui/SolveFlowCanvas.tsx:130–142`、`ui/flow/selection.ts` |
| 两套主题只换令牌值，组件层不写死颜色 | 通读 `styles/{tokens,base,components,views,canvas,flow}.css`：除 `tokens.css:5–41` 外无裸 hex；`flow.css:13–39` 把库变量全部映射到 `--pd-*` |

## §5 无法核与替代核法

| 未能核的项 | 原因 | 替代核法 |
| --- | --- | --- |
| hover / focus-visible 的**实际观感**、theme 切换后逐区域实际取色 | 本环境无浏览器、无 Playwright 截图 | 已用「选择器 → 令牌」对账代替；需要一次人工/浏览器点验（尤其 `flow.css` 覆盖 `@xyflow` 默认皮后的实际渲染） |
| 面板收起/展开的真实动画与互斥拦截 | 收起链路本身未实现（M1/M2），无可观测对象 | 等 M1/M2 落地后，用键盘 `[` `]` 与把手各走一遍，并断言 `data-canvas`/`data-right` 互斥 |
| 节点逐类像素尺寸（核心 208×56 / 子 176×48 / 实体 176×64 …，02:152–160） | 尺寸由 `domain/layout.ts cardSizeOf` 注入（`ui/flow/toFlow.ts:194,218`），本轮未逐类取值 | 在 `layout.test.ts` 里对每类断言尺寸常量，或跑一次 render 静态 DOM 抓 `style="width"` |
| 令牌 50 条计数、`grep '#hex'`=0、1px 边框命中数 ≤6（02:214–219 自检 6 条） | 未跑计数命令（本轮预算） | 按 02 §9 的三条命令直接跑：`grep -o '\-\-pd-[a-z0-9-]*' tokens.css \| sort -u \| wc -l` 等 |
| C1–C6 检查规则与文案（01:160–167） | 本轮聚焦 UI 面，`domain/checks/index.ts`（311 行）未逐条核对 | 单列一次「检查规则走查」，用 `checks.test.ts` 现有用例做底 |
| 左 264 / 右 340 下长标题的真实溢出 | CSS 已见 ellipsis（`.title`/`.sb-title`/`.node-title`），未做像素实测 | 造一个 60 字标题 + 60 字工作区名，量是否撑破列宽 |
