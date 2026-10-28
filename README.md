# tools_public（公开工具源）

这是工具箱的公开工具仓库。工具放在 `tools/` 下一层，不再用目录表达分类；分类由壳程序的标签树决定，工具只声明 `tags`。

## 布局

```text
.
├── README.md
└── tools/
    ├── regex-tester/               # 只有一个形态：不要版本层
    │   └── tool.json
    ├── study-hall/                 # 只有一个版本：同样不收版本层
    │   ├── tool.json
    │   ├── README.md               # 可选，不发布
    │   └── site/
    │       └── index.html
    ├── lottery/                    # 有三版：才需要版本层
    │   ├── 1.0.0/
    │   │   ├── tool.json
    │   │   └── site/
    │   ├── 2.0.0/
    │   │   ├── tool.json
    │   │   └── site/
    │   └── 3.0.0/
    │       ├── tool.json
    │       └── site/
    └── …
```

- 一层目录名就是工具 **id**，版本层可选：
  - `tools/<id>/tool.json` —— 无版本；
  - `tools/<id>/<版本>/tool.json` —— 有版本，版本是 `X.Y.Z`。
- **`tool.json` 里不写 `id`，也不写 `version`**：两者只从目录名取，写了会构建失败。
  id 与版本各有两个来源时，改目录名漏改一处就留下线上查不出来的错位。
- 同一个 id 只能走一种形态。既有 `tool.json` 又有版本目录、或者有版本目录还混进别的子目录，都直接失败。
- **只有一个版本的工具不要版本层**。`1.0.0/` 这种只有一个子目录的版本层没有信息量：坐标多一段、路径多一段，切不出第二版。等真要并存第二版时再建 `<新版本>/` 并把它挪进去，那时才收成版本层。
- `h5` 必须有 `site/`，入口相对 `site/`；`web` 的 `entry` 是 https 地址，不需要 `site/`。
- 目录内的说明、构建脚本、测试都不发布，只有 `site/` 会被拷进产物。
- 仓库根可放贡献说明等；发布只扫 `tools/`。

## 当前工具

| id | 形态 | 版本 | tags |
| --- | --- | --- | --- |
| clean-architecture-zh | web | — | books |
| component-atlas | h5 | — | books |
| layout-atlas | h5 | — | books |
| motion-lexicon | web | — | books |
| html-css-js | web | — | dev |
| plantuml | web | — | dev |
| react-lab | web | — | dev |
| regex-tester | web | — | dev |
| wireframe-lab | h5 | — | dev |
| study-hall | h5 | — | edu |
| petal-drift | h5 | — | scene |
| lottery | h5 | 1.0.0 / 2.0.0 / 3.0.0 | scene |
| link-public | web | — | test |
| self-check-public | h5 | — | test |

`lottery` 是唯一有版本层的工具：`1.0.0` 是旧的单页抽奖，`2.0.0` 是按环节组织的新版，
`3.0.0` 修了两条会毁掉现场的问题（彩排按正式入账、导入按位置猜列）并补上名额设置与演出层撤回。
它的第二版原来是以 `lottery3` 这个独立 id 存在的（没有版本机制时的权宜做法），现已并回 `lottery`，
两个 id 的差别改由版本表达。

外链工具的页面不由我们维护，给它挂版本号只是记了个会过期的数字，所以没有版本层。

`test` 下工具只验证发布链路，不是日常使用工具。`self-check-public` 声明了 `llm.chat`：
打开不调模型，按一下「试一次对话」才发一条最短的请求，顺便把能力包那条链路也验了。

发布器按工具箱清单契约校验字段与入口；契约见仓库文档 `docs/containers/toolbox_app/附录/01-工具清单.md`。

## 能力包

`caps/<id>/` 是注入给工具的能力：一个包一份 `cap.json` 加一个 `dist/`，工具在
`tool.json` 的 `capabilities` 里声明用哪一条，壳装载后挂在工具页的 `window.__toolbox` 上。
**工具只能引用本源发布的能力包**——私有工具用不上这里的包，反过来也一样。

| 包 | 能力 id | 给什么 |
| --- | --- | --- |
| `xlsx` | `xlsx` | 读一份 .xlsx，交出表名与行 |
| `llm` | `llm.chat` | 调一次模型：`text` / `stream` / `raw` |

### `llm.chat` 现在是临时形态

**它直连云托管上的 LiteLLM，master key 就写在包里。** 包是发布产物，
`releases/tools_public/<版本>/caps/llm/index.js` 谁都能下载到，两份凭据等于公开——
上游的调用额度因此是敞开的，谁拿到谁花。先用着，收口方向是改成 `ctx.call("llm.chat", …)`：
由 `toolbox_service` 持 key 代发、按用户记账与限流，那时这个包该进私有仓。

```js
// 能力由壳注入，onload 之后才挂上来：先问，没有再等事件。
const llm = window.__toolbox.use("llm.chat");
const 回复 = await llm.stream([{ role: "user", content: "…" }], {
  onDelta: (片) => 把(片),
});
```

- 默认**关思考**（上游模型默认开，思考 token 也是钱）；要推理传 `thinking: "auto"`。
- 上游最小实例是 0：缩容之后第一次请求要把容器叫醒，几十秒是常态，界面上要给一句提示。
- 超时默认 90 秒，只掐到响应头；流式开始之后由调用方用 `signal` 决定什么时候停。

## 发布

本仓独立发布，只写 `releases/tools_public/`；不读另一个仓，也不生成总清单。

```text
git tag v0.1.0 && git push origin v0.1.0
  ↓ GitHub Actions（只有 tag 触发，分支推送不发布）
  node scripts/build-release.mjs          组装 .release/
  node scripts/upload-release.mjs         分片经 /ops/shell 写进 releases/tools_public/v0.1.0-s5/
  POST <toolbox_service>/ops/releases { source: "tools_public", release: "v0.1.0-s5" }
```

**仓的版本就是 tag**，跟工具自己的版本是两件事：tag 代表「这批工具的一次快照」，
用于整批回滚；工具的版本是 `tools/<id>/<版本>/` 那一层，用于单个工具回切。
本仓没有一个像 `package.json` 那样的单点版本文件。目录名带 `-s5` 是清单形状版本，
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
