/* data.js —— 组件图册的全部内容。
 *
 * 页面不认识任何一个组件，只把这里的数据画出来：加一条就是往 items 里加一个对象，
 * 删一条就是从数组里拿掉一个对象。页面本身不用改。
 *
 * 分类不在这里 —— 条目只有扁平的 tags，树是 index.html 顶部那份 TREE。想落在
 * 「部件 / 输入 / 会话输入框」下，就把它这条链上的 id 一个个打上。
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
      /* 会话输入框：一条组件，两种形态。
       * 空着是 52px 的胶囊（语音 · 占位 · 附件），一有内容就向上展开成卡片，
       * 顶部浮出被引用的角色，底部升起工具条（语音 · 模型 · 附件 · 发送）。
       * 两种形态靠 body[data-state] 切，纯 CSS —— 预览 iframe 里没有脚本。 */
      id: "composer-expand",
      name: "收放式会话输入框",
      tags: ["部件", "输入", "会话输入框", "风格", "极简", "场景", "对话"],
      summary: "空着时是一条胶囊，只有语音、占位和附件；一开始打字就向上展开成卡片，顶部浮出被引用的角色，底部升起工具条。",
      note: "工具条那四样是按使用频率排的：语音在最左，因为在这个 App 里说话是主路径，不是打字的备选；模型选择紧跟其后，因为「换谁回答」是每一次提问的属性，不该藏进设置页；附件和发送靠右，收尾动作。空态刻意不给发送键 —— 没有内容就没有可发的东西，少一个键少一次误触。代价是四样挤一行，窄屏上先被挤掉的是模型名的字数。",
      previewVw: 380,
      previewVh: 270,
      states: [
        { id: "filled", label: "有内容" },
        { id: "empty",  label: "空态" }
      ],
      metrics: [
        { label: "空态",     value: "52px 高 · 圆角 24" },
        { label: "展开",     value: "约 200px 高" },
        { label: "内距",     value: "12 / 14" },
        { label: "工具条",   value: "键 22px · 间隔 10" },
        { label: "发送钮",   value: "32px · 距右边 14" },
        { label: "引用胶囊", value: "26px 高 · 字 13" }
      ],
      params: [
        { name: "r",   label: "圆角",     min: 12, max: 32, step: 1, value: 24, unit: "px" },
        { name: "pad", label: "左右内距", min: 10, max: 22, step: 1, value: 14, unit: "px" },
        { name: "btn", label: "发送钮",   min: 24, max: 44, step: 1, value: 32, unit: "px" }
      ],
      html: `
<div class="composer">

  <!-- 引用：这一条提问挂在哪个角色／哪条消息上。可移出，所以带叉。 -->
  <div class="quote">
    <svg class="qava" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#c3d9f0"/>
      <circle cx="12" cy="9.4" r="3.5" fill="#fff"/>
      <path d="M4.9 21.6a7.1 7.1 0 0 1 14.2 0z" fill="#fff"/>
    </svg>
    <span class="qtext">资深产品经理</span>
    <svg class="qx" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="currentColor" opacity=".3"/>
      <path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  </div>

  <!-- 正文：换行照留，末尾那根是插入光标 -->
  <div class="text">抽奖这版的概念太绕，帮我看看还能怎么收：<br>1. 组抽奖、分区抽奖，第一次见分不清<br>2. 顶部三个入口在做同一件事<br>3. 空态和加载态分不清<span class="caret"></span></div>

  <!-- 工具条：空态只留语音与附件，中间那段占位顶上去当提示 -->
  <div class="bar">
    <svg class="ico wave" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
      <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none"/>
      <path d="M7.5 8.5a5 5 0 0 1 0 7"/>
      <path d="M11 6a8.5 8.5 0 0 1 0 12"/>
      <path d="M14.5 3.5a12 12 0 0 1 0 17"/>
    </svg>

    <span class="ph">发消息或按住说话...</span>

    <!-- 模型选择：这次用谁回答。放在输入框里而不是设置里，因为它按次变。 -->
    <span class="model">
      <svg class="mlogo" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="currentColor"/>
        <path class="half" d="M12 2.5a9.5 9.5 0 0 1 0 19 4.75 4.75 0 0 1 0-9.5 4.75 4.75 0 0 0 0-9.5z"/>
      </svg>
      <span class="mtext">Hy4 preview</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 9.5l6 5.5 6-5.5"/>
      </svg>
    </span>

    <svg class="ico plus" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13"/>
    </svg>

    <span class="send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 19V6M6.2 11.8 12 6l5.8 5.8"/>
      </svg>
    </span>
  </div>

</div>`,
      css: `
/* 底：这层只是把组件放到页面上，用 App 自己的冷灰，不迁就工具页那套暖色 */
body{align-items:flex-end;padding:16px 18px 20px;background:#f5f5f7}

.composer{
  width:100%;display:flex;flex-direction:column;gap:10px;
  padding:12px var(--pad) 10px;border-radius:var(--r);
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.05);
}

/* ── 引用胶囊 ───────────────────────────────────────────── */
.quote{align-self:flex-start;display:flex;align-items:center;gap:6px;
       height:26px;padding:0 8px 0 3px;border-radius:999px;background:#efeff2}
.qava{width:20px;height:20px;flex:0 0 auto;border-radius:50%}
.qtext{font-size:13px;line-height:1;color:#5c5c63;white-space:nowrap}
.qx{width:14px;height:14px;flex:0 0 auto}

/* ── 正文 ───────────────────────────────────────────────── */
.text{font-size:15px;line-height:1.62;color:#141416}
.caret{display:inline-block;width:2px;height:15px;margin-left:1px;
       vertical-align:-2px;background:#2e9e6b}

/* ── 工具条 ─────────────────────────────────────────────── */
.bar{display:flex;align-items:center;gap:10px}
.ico{flex:0 0 auto;color:#141416}
.wave{width:22px;height:22px}
.plus{width:24px;height:24px}

/* 模型选择：整块是个药丸，点击区比字大一圈 */
.model{display:flex;align-items:center;gap:6px;margin-right:auto;
       height:30px;padding:0 9px 0 4px;border-radius:999px;background:#f2f2f5}
.mlogo{width:20px;height:20px;flex:0 0 auto;color:#111}
.mlogo .half{fill:#fff}
.mtext{font-size:14px;line-height:1;color:#141416;white-space:nowrap}
.chev{width:14px;height:14px;flex:0 0 auto;color:#8e8e93}

.send{flex:0 0 auto;width:var(--btn);height:var(--btn);border-radius:50%;
      display:grid;place-items:center;background:#111;color:#fff}
.send svg{width:18px;height:18px}

/* 占位：只在空态出现，撑开中间那段 */
.ph{display:none;flex:1 1 auto;font-size:15px;color:#9e9ea3;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}

/* ── 空态：收成一条胶囊，向上生长的是它，底边不动 ────────── */
body[data-state="empty"] .composer{
  flex-direction:row;align-items:center;height:52px;padding:0 var(--pad);
}
/* 横排时 .bar 得自己撑满整行，否则它的宽度就是内容宽，加号会停在半路 */
body[data-state="empty"] .bar{flex:1 1 auto}
body[data-state="empty"] .quote,
body[data-state="empty"] .text{display:none}
body[data-state="empty"] .model,
body[data-state="empty"] .send{display:none}
body[data-state="empty"] .ph{display:block}

/* ── 暗色：按 iOS 那套语义推的，不是抄的 ────────────────── */
body[data-theme="dark"]{background:#0e0e10}
body[data-theme="dark"] .composer{background:#1c1c1e;box-shadow:0 1px 3px rgba(0,0,0,.5)}
body[data-theme="dark"] .text{color:#f2f2f7}
body[data-theme="dark"] .ph{color:#8e8e93}
body[data-theme="dark"] .quote{background:#2c2c2e}
body[data-theme="dark"] .qtext{color:#c7c7cc}
body[data-theme="dark"] .model{background:#2c2c2e}
body[data-theme="dark"] .mtext{color:#f2f2f7}
body[data-theme="dark"] .mlogo{color:#f2f2f7}
body[data-theme="dark"] .mlogo .half{fill:#1c1c1e}
body[data-theme="dark"] .chev{color:#8e8e93}
body[data-theme="dark"] .ico{color:#f2f2f7}
body[data-theme="dark"] .send{background:#f2f2f7;color:#1c1c1e}
`
    }
  ]
};

/* ── 字段口径 ────────────────────────────────────────────────────────────
 *
 * id        必填。小写字母、数字、连字符；全局唯一。建议 <部件>-<做法>。
 * name      必填。做法的名字，不是部件名。
 * tags      必填。扁平数组，写的是 index.html 里 TREE 上那条链的 id，一条一个。
 *            想落在 部件/输入/会话输入框 下，就写 ["部件","输入","会话输入框", …]。
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
