# 问题域画板

两域画板：先在「问题域」把模糊问题推成清晰的问题结构，再切到「解域」把结构推成领域模型（实体、行为、约束）。设计稿在 `docs/design/`，产物是静态站点，无后端、无账号、无远程字体。

当前能力：问题域的问题树 / 画布 / 详情与检查 C1–C5；解域的实体-关系画布 / 领域模型与检查 C6；撤销重做；五类领域元素；三类导出（JSON / Markdown / TypeScript 骨架+种子）与导入校验。画布基于 `@xyflow/react`。

## 目录

```text
src-web/                 独立前端包（自己的 package.json / lockfile）
├── index.html           Vite 入口，构建后即 site/index.html
├── vite.config.ts       base "./"、build.outDir "../site"、emptyOutDir
├── tsconfig.json        strict + bundler + react-jsx
├── scripts/             build.mjs / serve-check.mjs / render.test.mjs
└── src/
    ├── domain/          纯函数层：types / schema / id / factory / normalize / serialize / migrate / checks / export / layout / solve（含 *.test.ts）
    ├── store/           唯一写入口 + 落盘：docStore / uiStore / commands / persistence / storage / bootstrap / history / elements / drag（含 *.test.ts）
    ├── ui/              组件：只渲染 + 发命令，不含业务规则
    │   └── flow/        画布适配：toFlow / nodeSync / dragCancel（含 *.test.ts）
    ├── styles/          tokens.css / base.css / components.css / views.css / canvas.css / flow.css
    └── main.tsx         入口
```

依赖方向单向：`main → App → ui → store → domain`；`domain/` 不 import React、store、ui，也不碰 DOM 与 localStorage。

## 命令

命令都在 `src-web/` 里跑：

```bash
cd src-web
npm install            # 安装依赖；受限环境可加 --ignore-scripts
npm run dev            # 开发服务器（走 vite.config.ts）
npm run typecheck      # tsc --noEmit
npm run build          # = node scripts/build.mjs，产物落 ../site
npm run test           # node:test 纯函数 + store + 画布适配 + 渲染自测，无 DOM
npm run check:site     # 起本地静态服务器把 site/ 打开一遍（200 + 资源可取）
```

## 构建产物

`npm run build` 产出工具根的 `site/`（`index.html` + `assets/`）。`site/` 需随代码一起提交：发布脚本只拷 `site/`，不做构建。

### 构建为什么不是裸 `vite build`

`vite build` 用 esbuild 的服务进程转译 TSX，而该进程靠管道 stdio 与宿主通信；部分受限沙箱禁止带管道 stdio 的子进程（`spawn EPERM`），裸 `vite build` 在那里必然失败。`scripts/build.mjs` 因此分两步都在**进程内**完成：

1. TypeScript 编译器 API 把 `src/` 编成 ESM 到 `.build/`（import 里的 `.ts` 自动改写为 `.js`）；
2. Vite 的 `build()` 把 `.build/` 打包到 `../site`（`base: "./"`、清空 outDir、`esbuild: false`）。

产物仍是 Vite 静态站点：单 chunk、相对路径、无 `.map`；发布脚本只拷 `site/`。代价是构建不走 `vite.config.ts`，两处配置需保持一致（`base` / `outDir`）。若在普通环境想用裸 `vite build`，`vite.config.ts` 已经写好同样的配置，可直接用。

## 本地存储

| 键 | 内容 |
| --- | --- |
| `problem-domain-canvas:workspace:v2` | 整份 Workspace（含 `schemaVersion`） |
| `problem-domain-canvas:workspace:backup:v2` | 上一版原文，配额不足时第一个被回收 |
| `problem-domain-canvas:session:v1` | `{domain, selectedId, theme, canvasOpen, detailOpen, ignoredChecks[]}` |

文档落盘 300ms 防抖 / 2000ms 强制写；`pagehide`/`beforeunload`/`visibilitychange→hidden` 立即 flush。读兜底链：主键 → backup → 空工作区。
