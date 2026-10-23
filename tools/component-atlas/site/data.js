/* data.js —— 组件图册的全部内容。
 *
 * 页面不认识任何一个组件，只把这里的数据画出来：加一条就是往 items 里加一个对象，
 * 删一条就是从数组里拿掉一个对象。页面本身不用改。
 *
 * 分类不在这里 —— 条目只有扁平的 tags，树是 index.html 顶部那份 TREE。想落在
 * 「部件 / 输入 / 单行输入框」下，就把它这条链上的 id 一个个打上。
 *
 * BASE 是预览里那层基础样式。预览装在一个没有脚本权限的 iframe 里，本文件的字体与
 * 变量漏不进去，反过来也一样 —— 所以预览那份基础样式只能在这里，每次拼进 iframe
 * 的文档头，不能靠页面继承。BASE 认两个开关：
 *   body[data-theme="dark"]  明暗，由工具页的明暗开关带进来
 *   body[data-state="xx"]    状态，由抽屉上的状态按钮带进来，条目自己的 css 去接
 *
 * 字段口径在文件末尾，也在本目录 README.md 里。
 */

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  font:400 13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#3d3830;background:#fff;
  display:flex;align-items:center;justify-content:center;padding:24px;
}
body[data-theme="dark"]{color:#ece5d8;background:#1c1a17}
input{font:inherit;color:inherit;background:none;border:0;outline:none;width:100%}
`;

const CATALOG = {
  items: [
    {
      id: "input-underline",
      name: "下划线输入框",
      tags: ["部件", "输入", "单行输入框", "风格", "极简", "场景", "表单"],
      summary: "只有一条底线，标签浮在上方；聚焦时底线加粗并换成强调色。",
      note: "不给它边界感就是它的边界感 —— 密集录入的表单里一排下划线会把行距吃掉，让人对不齐，那种场合改用填充式。",
      previewVw: 360,
      previewVh: 124,
      states: [
        { id: "default",  label: "默认" },
        { id: "focus",    label: "聚焦" },
        { id: "filled",   label: "有值" },
        { id: "error",    label: "报错" },
        { id: "disabled", label: "禁用" }
      ],
      metrics: [
        { label: "高",   value: "40px" },
        { label: "底边", value: "1px / 聚焦 2px" },
        { label: "标签", value: "12px · 距框 6px" },
        { label: "字",   value: "14px" },
        { label: "错误", value: "12px · 距框 6px" }
      ],
      params: [
        { name: "h",   label: "框高",     min: 28, max: 56, step: 1, value: 40, unit: "px" },
        { name: "lw",  label: "底边宽",   min: 1,  max: 3,  step: 1, value: 1,  unit: "px" },
        { name: "gap", label: "标签间距", min: 2,  max: 14, step: 1, value: 6,  unit: "px" }
      ],
      html: `
<div class="field">
  <label>邮箱</label>
  <div class="box"><input class="in" placeholder="you@example.com"></div>
  <p class="err">邮箱格式不对</p>
</div>`,
      css: `
.field{width:248px;display:flex;flex-direction:column}
.field label{font-size:12px;color:#8b8172;margin-bottom:var(--gap)}
.box{height:var(--h);display:flex;align-items:flex-end;
     border-bottom:var(--lw) solid #d8d5cf;transition:border-color .15s}
.in{height:calc(var(--h) - var(--lw));padding:0 1px;font-size:14px}
.in::placeholder{color:#a2988a}
.err{display:none;margin:var(--gap) 0 0;font-size:12px;color:#c0553f}

/* 有值：占位符换成正文色，看上去就是填过了 */
body[data-state="filled"] .in::placeholder{color:#3d3830}

body[data-state="focus"] .box{border-bottom-width:calc(var(--lw) + 1px);border-bottom-color:#8a6a3d}
body[data-state="error"]  .box{border-bottom-color:#c0553f}
body[data-state="error"]  .err{display:block}
body[data-state="disabled"] .box{border-bottom-style:dashed;border-bottom-color:#dcd7cc}
body[data-state="disabled"] .field label{opacity:.5}
body[data-state="disabled"] .in::placeholder{color:#c9c2b5}

body[data-theme="dark"] .field label{color:#9a9186}
body[data-theme="dark"] .box{border-bottom-color:#3a352e}
body[data-theme="dark"] .in::placeholder{color:#6f685e}
body[data-theme="dark"] .err{color:#e0806a}
body[data-state="filled"][data-theme="dark"] .in::placeholder{color:#ece5d8}
body[data-state="focus"][data-theme="dark"] .box{border-bottom-color:#d0a768}
body[data-state="error"][data-theme="dark"] .box{border-bottom-color:#e0806a}
body[data-state="disabled"][data-theme="dark"] .box{border-bottom-color:#33302a}
body[data-state="disabled"][data-theme="dark"] .in::placeholder{color:#5a544c}
`
    },

    {
      id: "input-filled",
      name: "填充输入框",
      tags: ["部件", "输入", "单行输入框", "风格", "填充", "场景", "表单"],
      summary: "整块灰底当容器，没有描边；聚焦时底色加深，底边浮出一条强调色。",
      note: "块头大，一屏放不下几个 —— 短表单、搜索栏、筛选区合适，长表单用它会让页面变成一片灰。",
      previewVw: 360,
      previewVh: 124,
      states: [
        { id: "default",  label: "默认" },
        { id: "focus",    label: "聚焦" },
        { id: "filled",   label: "有值" },
        { id: "error",    label: "报错" },
        { id: "disabled", label: "禁用" }
      ],
      metrics: [
        { label: "高",   value: "44px" },
        { label: "圆角", value: "8px" },
        { label: "内距", value: "0 12px" },
        { label: "底",   value: "#f2efe8 / 聚焦 #eae5da" },
        { label: "字",   value: "14px" }
      ],
      params: [
        { name: "h",   label: "框高",   min: 32, max: 60, step: 1, value: 44, unit: "px" },
        { name: "r",   label: "圆角",   min: 0,  max: 22, step: 1, value: 8,  unit: "px" },
        { name: "pad", label: "左右内距", min: 6, max: 20, step: 1, value: 12, unit: "px" }
      ],
      html: `
<div class="field">
  <div class="box"><input class="in" placeholder="you@example.com"></div>
  <p class="err">邮箱格式不对</p>
</div>`,
      css: `
.field{width:248px;display:flex;flex-direction:column}
.box{height:var(--h);display:flex;align-items:center;padding:0 var(--pad);
     border-radius:var(--r);background:#f2efe8;
     border-bottom:2px solid transparent;transition:background .15s,border-color .15s}
.in{font-size:14px}
.in::placeholder{color:#a2988a}
.err{display:none;margin:6px 0 0;font-size:12px;color:#c0553f}

body[data-state="filled"] .in::placeholder{color:#3d3830}

body[data-state="focus"] .box{background:#eae5da;border-bottom-color:#8a6a3d}
body[data-state="error"]  .box{background:#f7ece8;border-bottom-color:#c0553f}
body[data-state="error"]  .err{display:block}
body[data-state="disabled"] .box{background:#f7f5f0}
body[data-state="disabled"] .in::placeholder{color:#c9c2b5}

body[data-theme="dark"] .box{background:#26231e}
body[data-theme="dark"] .in::placeholder{color:#6f685e}
body[data-theme="dark"] .err{color:#e0806a}
body[data-state="filled"][data-theme="dark"] .in::placeholder{color:#ece5d8}
body[data-state="focus"][data-theme="dark"] .box{background:#302c25;border-bottom-color:#d0a768}
body[data-state="error"][data-theme="dark"] .box{background:#33241f;border-bottom-color:#e0806a}
body[data-state="disabled"][data-theme="dark"] .box{background:#201e1a}
body[data-state="disabled"][data-theme="dark"] .in::placeholder{color:#5a544c}
`
    },

    {
      id: "input-outline",
      name: "描边输入框",
      tags: ["部件", "输入", "单行输入框", "风格", "描边", "场景", "表单"],
      summary: "四边一圈细描边加圆角，标签在框内占位；聚焦时描边换成强调色并加一圈淡光。",
      note: "最稳的一种，但也是最占地方的一种 —— 描边把每个框都撑出一圈，紧凑的表格行内编辑别用它。",
      previewVw: 360,
      previewVh: 124,
      states: [
        { id: "default",  label: "默认" },
        { id: "focus",    label: "聚焦" },
        { id: "filled",   label: "有值" },
        { id: "error",    label: "报错" },
        { id: "disabled", label: "禁用" }
      ],
      metrics: [
        { label: "高",   value: "44px" },
        { label: "圆角", value: "10px" },
        { label: "描边", value: "1px / 聚焦 2px" },
        { label: "内距", value: "0 12px" },
        { label: "字",   value: "14px" }
      ],
      params: [
        { name: "h",   label: "框高",   min: 32, max: 60, step: 1, value: 44, unit: "px" },
        { name: "r",   label: "圆角",   min: 0,  max: 22, step: 1, value: 10, unit: "px" },
        { name: "bw",  label: "描边宽", min: 1,  max: 3,  step: 1, value: 1,  unit: "px" }
      ],
      html: `
<div class="field">
  <div class="box"><input class="in" placeholder="you@example.com"></div>
  <p class="err">邮箱格式不对</p>
</div>`,
      css: `
.field{width:248px;display:flex;flex-direction:column}
.box{height:var(--h);display:flex;align-items:center;padding:0 12px;
     border:var(--bw) solid #d8d5cf;border-radius:var(--r);
     transition:border-color .15s,box-shadow .15s}
.in{font-size:14px}
.in::placeholder{color:#a2988a}
.err{display:none;margin:6px 0 0;font-size:12px;color:#c0553f}

body[data-state="filled"] .in::placeholder{color:#3d3830}

body[data-state="focus"] .box{border-color:#8a6a3d;box-shadow:0 0 0 3px rgba(138,106,61,.14)}
body[data-state="error"]  .box{border-color:#c0553f}
body[data-state="error"]  .err{display:block}
body[data-state="disabled"] .box{border-color:#e6e1d6;background:#faf8f4}
body[data-state="disabled"] .in::placeholder{color:#c9c2b5}

body[data-theme="dark"] .box{border-color:#3a352e}
body[data-theme="dark"] .in::placeholder{color:#6f685e}
body[data-theme="dark"] .err{color:#e0806a}
body[data-state="filled"][data-theme="dark"] .in::placeholder{color:#ece5d8}
body[data-state="focus"][data-theme="dark"] .box{border-color:#d0a768;box-shadow:0 0 0 3px rgba(208,167,104,.16)}
body[data-state="error"][data-theme="dark"] .box{border-color:#e0806a}
body[data-state="disabled"][data-theme="dark"] .box{border-color:#302c25;background:#232019}
body[data-state="disabled"][data-theme="dark"] .in::placeholder{color:#5a544c}
`
    },

    {
      id: "search-pill",
      name: "胶囊搜索框",
      tags: ["部件", "输入", "搜索框", "风格", "填充", "场景", "搜索"],
      summary: "全圆角的浅灰胶囊，左侧一枚放大镜；聚焦时底色转白、描边转实，右边浮出清除键的位置。",
      note: "圆角吃掉了两端空间，短查询词合适；要做长文本、带下拉建议的搜索，胶囊会在下拉那一刻破相。",
      previewVw: 360,
      previewVh: 108,
      states: [
        { id: "default",  label: "默认" },
        { id: "focus",    label: "聚焦" },
        { id: "filled",   label: "有值" },
        { id: "disabled", label: "禁用" }
      ],
      metrics: [
        { label: "高",   value: "38px" },
        { label: "圆角", value: "19px（半高）" },
        { label: "内距", value: "0 14px" },
        { label: "图标", value: "15px · 距字 8px" },
        { label: "字",   value: "14px" }
      ],
      params: [
        { name: "h",   label: "框高",   min: 28, max: 52, step: 1, value: 38, unit: "px" },
        { name: "pad", label: "左右内距", min: 8,  max: 22, step: 1, value: 14, unit: "px" },
        { name: "gap", label: "图标间距", min: 4,  max: 14, step: 1, value: 8,  unit: "px" }
      ],
      html: `
<div class="bar">
  <svg class="ico" viewBox="0 0 24 24" width="15" height="15" fill="none"
       stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <circle cx="11" cy="11" r="7"></circle><path d="M16.5 16.5 21 21"></path>
  </svg>
  <input class="in" placeholder="搜部件、风格或出处">
  <span class="clr" aria-hidden="true">清除</span>
</div>`,
      css: `
.bar{width:280px;height:var(--h);display:flex;align-items:center;gap:var(--gap);
     padding:0 var(--pad);border-radius:calc(var(--h) / 2);
     background:#f2efe8;border:1px solid transparent;transition:background .15s,border-color .15s}
.ico{flex:0 0 auto;color:#a2988a}
.in{flex:1 1 auto;font-size:14px}
.in::placeholder{color:#a2988a}
.clr{flex:0 0 auto;font-size:12px;color:#c0553f;opacity:0}

body[data-state="filled"] .in::placeholder{color:#3d3830}
body[data-state="filled"] .clr{opacity:1}

body[data-state="focus"] .bar{background:#fff;border-color:#8a6a3d}
body[data-state="focus"] .ico{color:#8a6a3d}
body[data-state="disabled"] .bar{background:#f7f5f0}
body[data-state="disabled"] .ico{color:#c9c2b5}
body[data-state="disabled"] .in::placeholder{color:#c9c2b5}

body[data-theme="dark"] .bar{background:#26231e}
body[data-theme="dark"] .ico{color:#6f685e}
body[data-theme="dark"] .in::placeholder{color:#6f685e}
body[data-theme="dark"] .clr{color:#e0806a}
body[data-state="filled"][data-theme="dark"] .in::placeholder{color:#ece5d8}
body[data-state="focus"][data-theme="dark"] .bar{background:#302c25;border-color:#d0a768}
body[data-state="focus"][data-theme="dark"] .ico{color:#d0a768}
body[data-state="disabled"][data-theme="dark"] .bar{background:#201e1a}
body[data-state="disabled"][data-theme="dark"] .ico{color:#5a544c}
body[data-state="disabled"][data-theme="dark"] .in::placeholder{color:#5a544c}
`
    }
  ]
};

/* ── 字段口径 ────────────────────────────────────────────────────────────
 *
 * id        必填。小写字母、数字、连字符；全局唯一。建议 <部件>-<做法>。
 * name      必填。做法的名字，不是部件名。
 * tags      必填。扁平数组，写的是 index.html 里 TREE 上那条链的 id，一条一个。
 *            想落在 部件/输入/单行输入框 下，就写 ["部件","输入","单行输入框", …]。
 *            链要连得上：打了子节点没打父节点，这条在树上落不到任何位置。
 * summary   必填。一句话说清这个做法长什么样。
 * note      可选。一句话说清什么时候别这么长。
 * source    可选。{ title, url }。
 * ref       可选。参考原图，相对 site/ 的路径，落在 site/img/ 下。
 * previewVw 预览的逻辑宽。previewVh 预览的逻辑高。部件有确定的自身尺寸，两个都要给。
 * states    必填。第一条是默认态。css 里接 body[data-state="xx"]。
 * metrics   可选，最多 6 条。给设计师的准尺。
 * params    可选。可调项，全部实现为 CSS 变量：name 即变量名，css 里写 var(--name)。
 *            params 与 css 里用到的 var(--…) 必须严格一一对应，check.mjs 会卡。
 * html      必填。片段 markup，不要包 <html><body>。
 * css       必填。片段样式。要写两套色：body[data-theme="dark"] 那一套。
 * script    留口子用。v1 不启用，写了非空 check.mjs 会报错。
 */
