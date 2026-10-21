# tools_public（公开工具源）

这是工具箱的公开工具仓库。工具放在 `tools/` 下一层，不再用目录表达分类；分类由壳程序的标签树决定，工具只声明 `tags`。

## 布局

```text
.
├── README.md
└── tools/
    ├── plantuml.tool.json          # web 简便：单文件
    ├── study-hall/                 # h5 / 带附属文件：目录
    │   ├── tool.json
    │   ├── README.md               # 可选，不发布
    │   └── site/
    │       └── index.html
    └── …
```

- **单文件** `tools/<id>.tool.json`：仅 `kind: "web"`，文件名主干与字段 `id` 一致。
- **目录** `tools/<id>/tool.json`：`web` 或 `h5`；`h5` 必须有 `site/`。目录内其它文件（说明、日后的详情页等）本轮发布忽略。
- 仓库根可放贡献说明等；发布只扫 `tools/`。

## 当前工具

| id | 形态 | tags |
| --- | --- | --- |
| clean-architecture-zh | 单文件 web | books |
| plantuml / react-lab / regex-tester / html-css-js | 单文件 web | dev |
| study-hall | 目录 h5 | edu |
| petal-drift | 目录 h5 | scene |
| lottery | 目录 h5 | scene |
| link-public | 单文件 web | test |
| self-check-public | 目录 h5 | test |

`test` 下工具只验证发布链路，不是日常使用工具。

发布器按工具箱清单契约校验字段与入口；契约见仓库文档 `docs/containers/toolbox_app/附录/01-工具清单.md`。

## 发布

本仓独立发布，只写 `releases/tools_public/`；不读另一个仓，也不生成总清单。

```text
push main → GitHub Actions
  node scripts/build-release.mjs          组装 .release/（catalog.json + tools/…）
  tcb hosting deploy .release releases/tools_public/<sha>-s5
  POST <toolbox_service>/ops/releases { source: "tools_public", release: "<sha>-s5" }
```

仓库设置里需要：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| variable | `CLOUDBASE_ENV_ID` | 目标 CloudBase 环境 |
| variable | `TOOLBOX_SERVICE_URL` | 指向 `toolbox_service` 的 HTTP 访问地址 |
| variable | `TOOLBOX_TOOLS_BASE` | 可选，H5 装载基址，默认 `https://toolbox.longyi.cloud/` |
| secret | `CLOUDBASE_APIKEY` | 环境 API Key，供 `tcb login` 与静态托管上传 |
| secret | `TOOLBOX_RELEASE_TOKEN` | **本仓专用**发布令牌；切不了私有仓的指针 |

清单契约（`schemaVersion: 5`）见主仓 `src/tcb/toolbox_service/README.md`。工具 id 与另一个仓
全局唯一，重名会由服务端拒绝切指针。
