# tools_public（公开工具源）

这是工具箱的公开工具仓库。工具放在 `tools/` 下一层，不再用目录表达分类；分类由壳程序的标签树决定，工具只声明 `tags`。

## 布局

```text
.
├── README.md
└── tools/
    ├── regex-tester/               # 外链工具：没有版本层
    │   └── tool.json
    ├── lottery/
    │   └── 1.0.0/                  # 版本层：一个目录一版，可并存
    │       ├── tool.json
    │       ├── README.md           # 可选，不发布
    │       └── site/
    │           └── index.html
    └── …
```

- 一层目录名就是工具 **id**，版本层可选：
  - `tools/<id>/tool.json` —— 无版本；
  - `tools/<id>/<版本>/tool.json` —— 有版本，版本是 `X.Y.Z`。
- **`tool.json` 里不写 `id`，也不写 `version`**：两者只从目录名取，写了会构建失败。
  id 与版本各有两个来源时，改目录名漏改一处就留下线上查不出来的错位。
- 同一个 id 只能走一种形态。既有 `tool.json` 又有版本目录、或者有版本目录还混进别的子目录，都直接失败。
- `h5` 必须有 `site/`，入口相对 `site/`；`web` 的 `entry` 是 https 地址，不需要 `site/`。
- 目录内的说明、构建脚本、测试都不发布，只有 `site/` 会被拷进产物。
- 仓库根可放贡献说明等；发布只扫 `tools/`。

## 当前工具

| id | 形态 | 版本 | tags |
| --- | --- | --- | --- |
| clean-architecture-zh | web | — | books |
| component-atlas | h5 | 1.0.0 | books |
| layout-atlas | h5 | 1.0.0 | books |
| motion-lexicon | web | — | books |
| html-css-js | web | — | dev |
| plantuml | web | — | dev |
| react-lab | web | — | dev |
| regex-tester | web | — | dev |
| study-hall | h5 | 1.0.0 | edu |
| petal-drift | h5 | 1.0.0 | scene |
| lottery | h5 | 1.0.0 | scene |
| lottery3 | h5 | 1.0.0 | scene |
| link-public | web | — | test |
| self-check-public | h5 | 1.0.0 | test |

外链工具的页面不由我们维护，给它挂版本号只是记了个会过期的数字，所以没有版本层。

`test` 下工具只验证发布链路，不是日常使用工具。

发布器按工具箱清单契约校验字段与入口；契约见仓库文档 `docs/containers/toolbox_app/附录/01-工具清单.md`。

## 发布

本仓独立发布，只写 `releases/tools_public/`；不读另一个仓，也不生成总清单。

```text
git tag v0.1.0 && git push origin v0.1.0
  ↓ GitHub Actions（只有 tag 触发，分支推送不发布）
  node scripts/build-release.mjs          组装 .release/
  node scripts/upload-release.mjs         分片经 /ops/shell 写进 releases/tools_public/v0.1.0-s5/
  POST <toolbox_service>/ops/releases { source: "tools_public", release: "v0.1.0-s5" }
```

**版本就是 tag**。本仓没有一个像 `package.json` 那样的单点版本文件：一次发布代表
「这批工具的快照」，所以版本记在仓上，不逐个工具记。目录名带 `-s5` 是清单形状版本，
形状一变目录名跟着变，免得长缓存的旧清单在客户端留很久。

tag 必须打在 `main` 上、形如 `vX.Y.Z`；流水线第一个 job 校验这两条，不满足直接失败。
清单里的 `sources[]` 仍记着具体提交，「v0.1.0 对应哪个 commit」随时查得到。

仓库设置里需要：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| variable | `TOOLBOX_SERVICE_URL` | 指向 `toolbox_service` 的 HTTP 访问地址 |
| variable | `TOOLBOX_TOOLS_BASE` | 可选，H5 装载基址，默认 `https://toolbox.longyi.cloud/` |
| secret | `TOOLBOX_RELEASE_TOKEN` | **本仓专用**发布令牌；切不了私有仓的指针 |

清单契约（`schemaVersion: 5`）见主仓 `src/tcb/toolbox_service/README.md`。工具 id 与另一个仓
全局唯一，重名会由服务端拒绝切指针。
