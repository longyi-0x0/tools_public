# PlantUML 看图（`plantuml-viewer`）

壳里打开的一页静态工具：贴一段 `.puml`，把图交给 **PlantUML 官方服务器**渲染后显示。
只做看图，不做编辑、不做导出、不做图库；在线编辑与官方文档在页面右上角的「官网 ↗」。
方案与验收表见 `docs/design/plantuml-viewer.md`。

```text
tool.json            # id 与版本只从目录名取，这里不写
package.json         # 只为 node 跑 test/ 时按 ESM 解析；不发布
site/                # 发布时整目录拷走，线上就是这几个文件
  index.html         # entry
  viewer.css
  viewer.js          # 状态机与 DOM
  encoding.js        # UTF-8 → raw DEFLATE → PlantUML 自定义 base64（纯函数）
  examples.js        # 三个内置示例
test/
  encoding.test.mjs  # 编码对拍：请求官方服务器，要 200 + image/svg+xml
README.md            # 不发布
```

## 加载方式

`<img src="https://www.plantuml.com/plantuml/svg/<编码>">`，不 `fetch` 图片字节：
跨源图片本来就能显示，也不需要依赖官方服务器的 CORS 头。成功看 `img.onload`，
失败看 `img.onerror`——但 `onload` 不代表图是对的（语法错、编码错都会以图片形态回来）。

编码（`site/encoding.js`，浏览器与 node 共用同一份）：

1. 源码 → UTF-8 字节；
2. 原生 `CompressionStream("deflate-raw")` 压成 raw DEFLATE（RFC 1951，无 zlib 头尾）；
3. 压出来的字节按 PlantUML 自己的 base64 表 `0-9A-Za-z-_` 编码。

不 vendor 第三方压缩库；浏览器没有 `CompressionStream` 时页面只说「浏览器太旧」，不发请求。

## 失败面

| 情形 | 页面 |
| --- | --- |
| 正常 | 图 + 「宽 × 高 · 编码 N 字符」；图下常驻一行「图里的英文来自官方服务器——PlantUML 报告的问题见图中」 |
| 源码没写 `@startuml` | 自动补头尾，并显示「已自动补 @startuml/@enduml」 |
| 语法错 | 照常显示官方那张 400 的报错 SVG（服务端 400 但 `Content-Type` 仍是 `image/svg+xml`），图下那行说明指过去 |
| 地址 > 7000 字符 | 前端先算长度，不发请求，直接说「这段图太大……约 N 字符」 |
| 断网 / 被拒 / 服务器忙 | 失败卡片：一句人话 + 「重试」+ 「在新标签打开这张图」（`<img>` 拿不到状态码，所以不承诺原因） |
| 浏览器没有 `CompressionStream` | 失败卡片，说明换浏览器；同样不发请求 |

最后一次输入存 `localStorage`（一个键 `toolbox.plantuml-viewer.source`），重载页面能恢复。

## 自测

```powershell
node tools/plantuml-viewer/test/encoding.test.mjs      # 需要联网
node --check site/viewer.js                            # 语法
```

对拍只认「服务端解得开」：`200` + `image/svg+xml` + 正文不含
`This URL does not look like DEFLATE data`；不逐字符比编码串（DEFLATE 实现不保证同字节）。
请求必须带浏览器 UA，否则官方直接 403。
