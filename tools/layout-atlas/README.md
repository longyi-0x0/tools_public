# 布局图册

一本能翻的册子：每页一个布局片段，页面上直接是活的效果，旁边是它的代码。挂在工具箱侧栏「书籍」那一支下。

完整的设计与取舍在主仓 `docs/布局图册形态设计-v1.md`（原型在 `docs/原型/布局图册-v1.html`）。

## 目录

```text
tools/layout-atlas/
├── tool.json          # 工具定义，唯一会被发布方读的文件
├── README.md          # 本文件。不发布
└── site/              # 发布的就是这一个目录的内容
    ├── index.html     # 页面本体
    └── data.js        # 全部内容
```

发布之后 `site/` 整个拷到 `<装载基址>releases/tools_public/<版本>/tools/layout-atlas/` 下，两个文件同级 —— 所以 `index.html` 里引 `data.js` 用相对路径就行，改文件名要连 `index.html` 那个 `<script src>` 一起改。

## 加一条

只改 `data.js`，页面一行都不动：往 `CATALOG.items` 里加一个对象。

```js
{
  id: "my-layout",
  name: "给它起个名字",
  group: "shell",
  tags: ["两栏"],
  summary: "一句话说清它是什么。",
  note: "一句话说清什么时候别用它。",
  source: { title: "出处名", url: "https://…" },
  previewVw: 1024,
  params: [
    { name: "aside", label: "侧栏宽", min: 100, max: 320, step: 10, value: 180, unit: "px" }
  ],
  html: `<div class="demo">…</div>`,
  css:  `.demo{ display:grid; grid-template-columns:var(--aside) 1fr; }`
}
```

字段口径在 `data.js` 末尾的注释里，与上面那段是一致的副本。

### 三条容易踩的

1. **`params` 的名字必须与 `css` 里用到的 `var(--…)` 严格一一对应。** 多了漏了都不行 —— 滑块改不动预览，或预览里的值找不到滑块，这条就失真了。加完务必把每根滑块拉到两头（最小值与最大值），看预览会不会塌。
2. **不依赖任何外部资源。** 预览 iframe 不给脚本权限，也不该挂第三方图片与字体。需要图片就用 `data.js` 里 `BASE` 给的 `.fillery` 条纹或 `.box` 色块占位。
3. **`previewVw` 是这条片段想被看到的宽度**，不是画面宽度。一眼桌面感的给 1024，一眼 App 感的给 420。响应式断点、`minmax()`、`auto-fit` 全按它重新排。

## 不收什么

| 不收 | 理由 |
| --- | --- |
| 依赖 Vue / React / Tailwind 的组件源码 | 这里收的是布局，是一段能直接贴进任何项目跑起来的 HTML+CSS |
| 需要 JS 才立得住的效果 | 预览 iframe 不给脚本权限 |
| 装饰重的视觉稿 | 收的是布局关系。渐变、拟物、特定字体进来会让每条长得都不一样，反而看不出结构 |
| 只有一张效果图、提炼不出结构的 | 图是素材，这里要的是能用 CSS 复现的骨架 |

## 自查

加完一条跑一次：

```bash
node check.mjs
```

零依赖、不联网、不开浏览器。查的是那些「错了不会报错，只会在页面上悄悄失真」的地方：`params` 与 `css` 里的 `var(--…)` 是否一一对应、`group` 是否在册子里、`id` 是否重复、默认值是否越界、必填字段有没有漏。有问题逐条列出并以 1 退出。

它查不到的是「拖到两头会不会塌」—— 那个得开页面把每根滑块拉到底看一眼。

## 发布

发版跟着整个仓走，不单独发：在仓库根打了 `vX.Y.Z` 的 tag 推上去，本工具随着那一版一起上线。
