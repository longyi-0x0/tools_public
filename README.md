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
| link-public | 单文件 web | test |
| self-check-public | 目录 h5 | test |

`test` 下工具只验证发布链路，不是日常使用工具。

发布器按工具箱清单契约校验字段与入口；契约见仓库文档 `docs/containers/toolbox_app/附录/01-工具清单.md`。
