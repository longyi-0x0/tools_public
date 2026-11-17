# 问题域画板 · 独立验收（IMP4）

验收人：verifier（只读 + 执行；未改任何源码 / 设计稿）。验收日：2026-11-17。
范围：`src-web/` 源码、`site/` 产物、`tool.json`、仓库卫生、反事实检查（坏数据 / 导出编译 / 六条检查 / 撤销）。
不采信四个 implementer 的 done 自述：下文每条结论都附本机重跑的命令输出或 `file:line`。

## §1 结论

**可交付（阻塞 0 条）**，但有 1 条必须在交付前处理的自相矛盾文案（§3-1）。

| 验收维度 | 判定 | 决定性证据（§4 有全文） |
| --- | --- | --- |
| 四条命令 | 全绿 | typecheck 0 / test 0（51 用例）/ build 0 / check:site 0 |
| 产物自包含 | 通过 | 全新临时目录起静态服务器：GET `/`、js、css 全 200；`index.html` 只引 `./assets/…` |
| 发布契约 | 通过 | 14 条判定逐条对照 `build-release.mjs:167–201`，全 OK；`tool.json` 无 `id`/`version` |
| 仓库卫生 | 通过 | `git status --porcelain --ignored` 里 `node_modules/`、`.build/` 均为 `!!`（被忽略），依赖树不会进仓 |
| 数据不丢 | 通过 | 坏 JSON→回落 backup；坏 JSON+坏 backup→空工作区+2 条 warnings；`schemaVersion:99`→拒绝载入并回落 backup |
| 导出可用 | 通过 | `toTs`+`toSeed` 落盘 `ts.createProgram(strict)` **0 诊断**；`interface` 2 === `entity` 2；`toMarkdown` 两次逐字节相等 |
| 检查真的会响 | 通过 | 六合一工作区 `runChecks` 命中 6/6（C1–C6），severity 只出现 `error`/`warning` |
| 撤销与持久化 | 通过（store 层） | 拖 7 次移动只产生 **1** 条记录（label「移动节点」），`undo` 后坐标回到 `{0,0}`、栈回到 0 |

## §2 阻塞项

| # | 问题 | 证据（file:line / 命令输出） | 影响 | 建议谁改 |
| --- | --- | --- | --- | --- |
| — | 无阻塞项 | — | — | — |

## §3 非阻塞与建议

1. **【P1，交付前处理】UI 文案承诺可撤销，但撤销在 UI 层不存在。** `DetailPanel.tsx:160` 写「清空后节点与边全部删除（可撤销）」。而 `undo`/`redo`/`canUndo`（`commands.ts:182/186/190`，`docStore.ts` 有完整实现）在 `src/ui/*.tsx`、`App.tsx`、`main.tsx` 的 grep 命中 **0**；读 `App.tsx:17–35` 的全局 keydown 只处理 `]`/`[`，无 Ctrl+Z。→ 用户删掉一棵问题树后无法回退，只能刷新（刷新反而丢了当前编辑）。改：imp4-ui 补 Ctrl+Z/撤销按钮，或删掉那句文案。
2. **命令层有 6 个导出在 UI 层零引用**：`createRootQuestion`、`createChildQuestion`、`createRelation`、`panBy`、`setWorkspaceGoal`、`renameWorkspaceTo`、`setDetailSection`（对 `src/ui/*.tsx`+`App.tsx`+`main.tsx` 逐名 grep，全部 0 命中）。可能是别名调用，也可能是死代码；建议 imp4-ui 或 imp4-domain 自查后清理，避免「定义了没人调」的假接线。
3. **删除实体后，行为/约束会从画布和树里同时消失。** `solve.test.ts` 断言「删除实体…行为不删」（文档层保留），但 `SolveCanvas.tsx:52–63` 按 `behaviorOnEntity`/`constraintOnEntity` 边反挂渲染，边被删后不再绘制；`Tree.tsx:267–273` 的 `SolveTree` 只列 `entity` 与 `entityRelation`，不列 `behavior`/`constraint`。→ 节点仍在 `ws.nodes` 里（导出会带出来、指标会计数），但界面上找不到、也点不到（无法再挂回实体）。这是已知取舍（不级联删除）的代价，建议：树里补一行「未挂靠的行为/约束」，或让 C6 覆盖「失去宿主的解域元素」。
4. **产物里的 `http://`/`https://` 全是字符串常量，不是外链资源。** bundle 中 18 处 `http://`、2 处 `https://` 的上下文逐条看过：`"https://react.dev/errors/"`（React 错误文案）、`http://www.w3.org/2000/svg`、`…/1998/Math/MathML`、`…/1999/xlink`、`…/XML/1998/namespace`（DOM 命名空间常量）。判定项：`src="http` 0、`import("http` 0、`XMLHttpRequest` 0、`new Image(` 0；唯一 `fetch(` 在 React preload 里取 `link.href`（本地 `./assets` 样式表）。→ 无网络依赖，离线可跑。
5. **`site/` 干净**：递归只有 `index.html`、`assets/index-CWQA_0DH.css`、`assets/index-D65H5UGR.js`；无 `.map`、无隐藏文件、无源码混入。
6. **`.npm-cache` 在仓库里不存在**（`tools/problem-domain-canvas/.npm-cache`、`src-web/.npm-cache` 均 False），brief 里的这条假设不成立；但 `src-web/.gitignore` 已含 `node_modules/`、`.npm-cache/`、`.pnpm-store/`、`.build/`、`*.tsbuildinfo`，未来出现也不会进仓。
7. **整个工具目录尚未入库**：`git status --porcelain` 只有 2 行 —— ` M README.md`、`?? tools/problem-domain-canvas/`。发布前需 `git add`；已确认 `node_modules/`（42 个顶级目录）与 `src-web/.build/` 都被 ignore，不会跟着 add 进去。
8. **视口不进撤销栈**（取舍正确）：`commands.ts:201–217` 的 `setView`/`zoomToPoint` 写的是 `uiStore` 视口，不走 `commitDoc`；撤销栈只由文档变更填充（`commands.ts` 里 11 处 `commitDoc` 均带 label）。与 01 §6「一次删除算一步」的口径一致。
9. **输入侧校验有兜底**：`createEdge`/`setSupportsQuestion`/`addEntityRelation` 对非法端点直接抛或返回原文档（`factory.ts` 同名函数），不会造出非法边——这与 01 §8 末尾「唯一拒绝导出：悬空边、端点类型不合法」的假设一致。

## §4 我实际跑过的命令与结果

在 `tools/problem-domain-canvas/src-web/` 下：

| 命令 | 退出码 | 关键输出 |
| --- | --- | --- |
| `npm run typecheck` | **0** | `tsc --noEmit`，无输出 |
| `npm run test` | **0** | 8 个 node:test 文件、**51 用例全过**（7+5+6+13+6+4+4+6），fail 0；含「toTs+toSeed 写临时目录后 tsc(strict) 零诊断」1880ms |
| `npm run build` | **0** | 产出 `site/index.html` + `assets/index-CWQA_0DH.css` + `assets/index-D65H5UGR.js` |
| `npm run check:site` | **0** | `GET / → 200`、`GET ./assets/index-D65H5UGR.js → 200`、`GET ./assets/index-CWQA_0DH.css → 200`，「产物自检通过」 |

自写反事实脚本（全部放 `%TEMP%`，未污染仓库；三次均 exit 0）：

- `%TEMP%\pdc_verify.mjs` —— `loadWorkspace` 五种输入（结果见 §1 表）；`initDoc`+`beginDrag`/`dragTo`×7/`endDrag`+`undo`；把 `site/` `cpSync` 到全新 `%TEMP%\pdc-site-*` 后起 `node:http` 静态服务器。实测：
  - `[坏 JSON + 好 backup] source=backup warnings=["storage 读不出来（存储内容不是合法 JSON），已跳过"]`
  - `[坏 JSON + 坏 backup] source=empty warnings=[两条]`
  - `[缺 schemaVersion] source=storage warnings=["缺少 schemaVersion，按当前版本继续校验"]`
  - `[schemaVersion:99] source=backup warnings=["…版本（v99）比本工具支持的（v2）更高，拒绝载入…"]`
  - `[空存储] source=empty warnings=[]`
  - 拖动：`初始 stack=0` → `拖动中 stack=0`（拖动过程不入栈）→ `endDrag 后 stack=1 label="移动节点" pos={"x":91,"y":119}` → `undo 后 stack=0 pos={"x":0,"y":0}`
  - 复制后的 `site/`：`GET / → 200`、`GET /assets/index-D65H5UGR.js → 200`、`GET /assets/index-CWQA_0DH.css → 200`
- `%TEMP%\pdc_verify2.mjs` —— 六合一工作区（核心未分解 q0 / 环 q1↔q2 / 孤立 q3 / 已回答缺反例 q4 / 待澄清有假设 q5 / 孤儿实体 e1）跑 `runChecks`：`findings=["C1:error","C2:error","C2:error","C2:error","C3:error","C4:error","C6:error","C5:warning"]`，去重命中 **6/6**，severity 集合 **["error","warning"]**（无第三档）。
- `%TEMP%\pdc_verify3.mjs` —— 导出落盘 + 编译 + 契约逐条：`ART toTs file=选课-model.ts`、`ART toSeed file=选课-seed.ts`；`IFACE 2 ENT 2 EQ true`；`MD_EQ true`；`DIAGS 0 rootFiles=2`；`CONTRACT` 14 条全 `OK`。

仓库卫生（在 `tools_public` 子仓）：

- `git status --porcelain` → 2 行：` M README.md` / `?? tools/problem-domain-canvas/`
- `git status --porcelain --ignored | Select-String 'node_modules'` → 1 行：`!! tools/problem-domain-canvas/src-web/node_modules/`（另有 `!! …/src-web/.build/`）
- 结论：**依赖树不会被提交**。

`tool.json` 对照 `build-release.mjs:167–201` 逐条：`schemaVersion===2` / `type===tool` / `id` 未定义 / `version` 未定义 / `kind=h5` / `entry` 非空且不以 `/` 开头、不含 `..` / 目录名合 `TOOL_ID` / 无版本层 / `site/` 存在 / `site/index.html` 存在 / `name` 非空 / `tags` 与 `capabilities` 是字符串数组 —— **14/14 OK**。README 34–37 行「不写 id、不写 version，写了会构建失败」与实现一致（`build-release.mjs:177–182`）。

## §5 因环境不能核的项

1. **真实浏览器里的交互没跑**：无 GUI 浏览器驱动，双击建边、拖拽手感、详情面板展开、导出下载（`URL.createObjectURL`+`a[download]`）只核到 store/domain 层与静态产物；`site/` 的 JS 能在静态服务器下 200 取到，但「点下去有没有反应」未验。
2. **发布脚本未实跑**：`build-release.mjs` 会写 `.release/` 暂存目录，超出本次「只写 ACCEPTANCE.md」的边界，故改为逐条对照其判定条件（§4）。`catalog.json`（`schemaVersion:5`）的真实生成未验。
3. **设计稿视觉一致性（02/03）未做人眼比对**：本次只验「能不能用」，不验「像不像设计稿」。
4. **撤销栈上限 10 步**（01 §6）未单独压测：只验了「一次拖动一条记录 + undo 回滚」，未验第 11 步的淘汰行为。
