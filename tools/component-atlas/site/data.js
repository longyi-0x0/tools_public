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
      /* 会话输入框：一条组件，四种形态。
       * 空着是 52px 的胶囊（语音 · 占位 · 附件），一有内容就向上展开成卡片，
       * 顶部浮出被引用的角色、底部升起工具条；过两行右上角浮出放大键，点开是
       * 整页写作（模型、附件、发送全撤掉）。全靠 body[data-state] 切，
       * 纯 CSS —— 预览 iframe 里没有脚本。 */
      id: "composer-expand",
      name: "收放式会话输入框",
      tags: ["部件", "输入", "会话输入框", "风格", "极简", "场景", "对话"],
      summary: "空着时是一条胶囊，只有语音、占位和附件；一开始打字就向上展开成卡片，顶部浮出被引用的角色，底部升起工具条。写超过两行，右上角浮出放大键，点开整页交给写作。",
      note: "工具条那四样是按使用频率排的：语音在最左，因为在这个 App 里说话是主路径，不是打字的备选；模型选择紧跟其后，因为「换谁回答」是每一次提问的属性，不该藏进设置页；附件和发送靠右，收尾动作。空态刻意不给发送键 —— 没有内容就没有可发的东西，少一个键少一次误触。超过两行时盒子长到四行封顶，再往上顶就撞键盘了，所以从那时起「继续写」交给右上角那个放大键（微信的路子）：先给一个小小的全屏入口，而不是让输入框无限长高。放大键放右上角是因为左上角已经给了引用 —— 那个位置更常用。全屏之后反而做减法：模型、附件、发送全撤掉，只留一个收起和右下角两个键 —— 那一刻的目的是写，不是决定发到哪。",
      previewVw: 380,
      previewVh: 400,
      states: [
        { id: "filled", label: "有内容" },
        { id: "long",   label: "超过两行" },
        { id: "full",   label: "全屏写" },
        { id: "empty",  label: "空态" }
      ],
      metrics: [
        { label: "空态",     value: "52px 高 · 圆角 24" },
        { label: "两行",     value: "149px · 超两行 197px" },
        { label: "全屏",     value: "整页 · 收起键 30px" },
        { label: "内距",     value: "12 / 14" },
        { label: "工具条",   value: "键 22px · 间隔 10" },
        { label: "发送钮",   value: "32px · 距右边 14" }
      ],
      params: [
        { name: "r",   label: "圆角",     min: 12, max: 32, step: 1, value: 24, unit: "px" },
        { name: "pad", label: "左右内距", min: 10, max: 22, step: 1, value: 14, unit: "px" },
        { name: "btn", label: "发送钮",   min: 24, max: 44, step: 1, value: 32, unit: "px" }
      ],
      html: `
<div class="composer">

  <!-- 头部一行：引用在左，放大在右。放大键只在内容超过两行时出现（微信的做法）。 -->
  <div class="head">
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

    <!-- 放大：去全屏写的入口。放在右上角，因为左上角已经给了附件／引用。 -->
    <span class="expand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 4H20v5.5M20 4l-5.6 5.6M9.5 20H4v-5.5M4 20l5.6-5.6"/>
      </svg>
    </span>
  </div>

  <!-- 两行以内：就这么多 -->
  <div class="text text-s">抽奖这版的概念太绕，帮我看看还能怎么收：<br>1. 组抽奖、分区抽奖，第一次见分不清</div>

  <!-- 超过两行：盒子长到四行封顶，再多的被裁住，右上角那个键就在这时候出现 -->
  <div class="text text-l">抽奖这版的概念太绕，帮我看看还能怎么收：<br>1. 组抽奖、分区抽奖，第一次见分不清<br>2. 顶部三个入口在做同一件事<br>3. 空态和加载态分不清<br>4. 中奖名单只能看不能导出<br>5. 分享出去的落地页没有返回入口<br>6. 抽奖记录里看不到奖品库存<br>你找一下问题吧<span class="caret"></span></div>

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

</div>

<!-- 点放大之后：整页交给写作。卡片没了、模型与附件没了、发送也没了
     （它在键盘上），只留一个收起、一片白、和右下角两个键。 -->
<div class="full" aria-hidden="true">
  <span class="fold">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9.5l6 6 6-6"/>
    </svg>
  </span>

  <div class="fulltext">抽奖这版的概念太绕，帮我看看还能怎么收：<br>1. 组抽奖、分区抽奖，第一次见分不清<br>2. 顶部三个入口在做同一件事<br>3. 空态和加载态分不清<br>4. 中奖名单只能看不能导出<br>5. 分享出去的落地页没有返回入口<br>6. 抽奖记录里看不到奖品库存<br>你找一下问题吧<span class="caret"></span></div>

  <div class="fulltools">
    <svg class="ftool" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="10.4"/>
      <rect x="10.2" y="6.6" width="3.6" height="6.4" rx="1.8"/>
      <path d="M8.6 12.1a3.4 3.4 0 0 0 6.8 0M12 15.6v1.9"/>
    </svg>
    <svg class="ftool" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="10.4"/>
      <path d="M8.4 14.4a4.3 4.3 0 0 0 7.2 0"/>
      <circle cx="9" cy="9.8" r=".9" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="9.8" r=".9" fill="currentColor" stroke="none"/>
    </svg>
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

/* ── 头部：引用在左，放大在右 ───────────────────────────── */
.head{display:flex;align-items:center;gap:10px}
.quote{display:flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;
       height:26px;padding:0 8px 0 3px;border-radius:999px;background:#efeff2}
.qava{width:20px;height:20px;flex:0 0 auto;border-radius:50%}
.qtext{font-size:13px;line-height:1;color:#5c5c63;white-space:nowrap;
       overflow:hidden;text-overflow:ellipsis}
.qx{width:14px;height:14px;flex:0 0 auto}

/* 放大键：默认不出现。它在右上角，是因为左上角已经被引用／附件占着，
   而这两个的位置比它更常用（引用决定上下文，附件是入口）。 */
.expand{display:none;flex:0 0 auto;margin-left:auto;width:26px;height:26px;
        align-items:center;justify-content:center;color:#6e6e73}
.expand svg{width:16px;height:16px}

/* ── 正文 ───────────────────────────────────────────────── */
.text{font-size:15px;line-height:1.62;color:#141416}
.text-l{display:none}
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

/* ── 超过两行：盒子长到四行封顶，多出来的裁住，放大键这时才出现 ──
   四行是微信那个位置的上限 —— 再长就顶到键盘了，所以它把「继续写」交给全屏。
   底部那道渐变不是装饰：没有它，第 4 行会被腰斩成半个字，看着像坏了。 */
body[data-state="long"] .text-s{display:none}
body[data-state="long"] .text-l{
  display:block;max-height:calc(1.62em * 4);overflow:hidden;
  -webkit-mask-image:linear-gradient(180deg,#000 80%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 80%,transparent 100%);
}
body[data-state="long"] .expand{display:flex}

/* ── 空态：收成一条胶囊，向上生长的是它，底边不动 ────────── */
body[data-state="empty"] .composer{
  flex-direction:row;align-items:center;height:52px;padding:0 var(--pad);
}
/* 横排时 .bar 得自己撑满整行，否则它的宽度就是内容宽，加号会停在半路 */
body[data-state="empty"] .bar{flex:1 1 auto}
body[data-state="empty"] .head,
body[data-state="empty"] .text{display:none}
body[data-state="empty"] .model,
body[data-state="empty"] .send{display:none}
body[data-state="empty"] .ph{display:block}

/* ── 全屏态：点放大之后，整页交给写作 ──────────────────────
   变的是三件事：卡片变整页；模型选择与附件消失（它们属于「这一条发去哪」，
   全屏写作时不打断）；发送也消失 —— 它跟着键盘走，页面里不该再放一个。 */
.full{display:none;flex:1;flex-direction:column;padding:16px 18px 0;background:#fff}
.fold{align-self:flex-start;display:grid;place-items:center;width:30px;height:30px;
      border-radius:50%;background:#f2f2f5;color:#141416}
.fold svg{width:17px;height:17px}
.fulltext{flex:1 1 auto;margin-top:22px;overflow:hidden;
          font-size:15px;line-height:1.62;color:#141416}
.fulltools{flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end;
           gap:20px;padding-bottom:16px}
.ftool{width:34px;height:34px;color:#141416}

body[data-state="full"]{align-items:stretch;padding:0;background:#fff}
body[data-state="full"] .composer{display:none}
body[data-state="full"] .full{display:flex}

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
body[data-theme="dark"] .expand{color:#9a9aa0}
/* 全屏页在暗色下是纯黑 —— 写作时不该有任何层级抢注意力 */
body[data-theme="dark"][data-state="full"]{background:#000}
body[data-theme="dark"] .full{background:#000}
body[data-theme="dark"] .fold{background:#2c2c2e;color:#f2f2f7}
body[data-theme="dark"] .fulltext{color:#f2f2f7}
body[data-theme="dark"] .ftool{color:#f2f2f7}
body[data-theme="dark"] .ico{color:#f2f2f7}
body[data-theme="dark"] .send{background:#f2f2f7;color:#1c1c1e}
`
    },
    {
      /* 01 右键上下文菜单。
       * 左边是被点的那个对象，指针压在卡片右上角；菜单就从这个角上长出来。
       * 装动作时每行是「图标 + 文字 + 快捷键」，复制那行整条铺蓝 —— 它是刚点过的
       * 那一下。装排序这类取值时面板一个像素都没变，每行换成「单选圈 + 名字」，
       * 底下再压一排升序／降序。原本图上这是两个部件（01 与 19），合成一条：
       * 尺寸与盒子完全一样，差的只是每行装什么，摆在一起才看得出这个差别。 */
      id: "menu-context",
      name: "右键上下文菜单",
      tags: ["部件", "菜单", "右键上下文菜单"],
      summary: "左边一张文件卡，指针压在它的右上角；右边贴着一列动作，图标在左、快捷键靠右，复制整行铺蓝，删除单独红着。换成排序时，同一副面板长出一行小标题、三个单选圈和底下一排升降序按钮。",
      note: "只放一层：一旦要子菜单，它就不是上下文菜单了，该用飞出菜单。动作项别加单选圈、选择项别加图标 —— 图标暗示「去做」，圈暗示「现在是」，两个提示挤在一行会打架。宽度跟着最长那行走，别写死，中文动作一长、快捷键一多就会被挤出横向滚动。排序那两个按钮别做成选项行，它们修饰的是选项，不是第四个选项。",
      ref: "img/menu-01-context.jpg",
      previewVw: 400,
      previewVh: 240,
      states: [
        { id: "action",  label: "动作" },
        { id: "hover",   label: "悬停重命名" },
        { id: "chooser", label: "排序方式" }
      ],
      metrics: [
        { label: "面板宽", value: "208px" },
        { label: "触发卡", value: "120 × 104" },
        { label: "项高",   value: "32px" },
        { label: "圆角",   value: "10px" },
        { label: "快捷键", value: "12px 等宽" },
        { label: "单选圈", value: "14px" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 180, max: 280, step: 4, value: 208, unit: "px" },
        { name: "row", label: "项高",   min: 26,  max: 40,  step: 1, value: 32,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="stage">

  <!-- 被点的那个对象：一张文件卡，指针停在它的右上角 —— 菜单是从这个点长出来的 -->
  <div class="target">
    <svg class="doc" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="6" y="3" width="28" height="34" rx="4" fill="#fff"/>
      <path d="M13 13.5h14M13 20h14M13 26.5h8" stroke="#8fa4ee" stroke-width="2.6"
            stroke-linecap="round"/>
    </svg>
    <span class="fname">界面草稿.fig</span>

    <!-- 指针：尖端压在卡片右上角，说明这一列是从这儿弹出来的 -->
    <svg class="cursor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 3.4l13 8-5.4 1.2-2.5 5.2z" fill="currentColor"/>
    </svg>
  </div>

  <div class="menu">

    <!-- 装动作：图标在左，快捷键顶到最右；复制那行是刚点过的，整条铺蓝 -->
    <div class="list list-action">
      <div class="row">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3.2 8.4V6.2a2 2 0 0 1 2-2h3.6l2 2.4h6a2 2 0 0 1 2 2v.9"/>
          <path d="M3.2 8.4h15.4a1.6 1.6 0 0 1 1.55 2l-1.7 7.2a1.8 1.8 0 0 1-1.75 1.4H4.8A1.8 1.8 0 0 1 3 17.6z"/>
        </svg>
        <span class="t">打开</span><span class="kbd">Enter</span>
      </div>
      <div class="row on">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2.2"/>
          <path d="M5.5 15V6a2 2 0 0 1 2-2h8"/>
        </svg>
        <span class="t">复制</span><span class="kbd">Ctrl C</span>
      </div>
      <div class="row">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4.5 19.5l.9-4 9.6-9.6a2 2 0 0 1 2.8 2.8L8.2 18.3z"/>
          <path d="M13.8 6.7l3.5 3.5"/>
        </svg>
        <span class="t">重命名</span><span class="kbd">F2</span>
      </div>
      <div class="row">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.2 13.8a3.4 3.4 0 0 1 0-4.8l2.6-2.6a3.4 3.4 0 0 1 4.8 4.8l-1.3 1.3"/>
          <path d="M13.8 10.2a3.4 3.4 0 0 1 0 4.8l-2.6 2.6a3.4 3.4 0 0 1-4.8-4.8l1.3-1.3"/>
        </svg>
        <span class="t">复制链接</span>
      </div>
      <div class="row danger">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4.5 6.8h15M9.5 6.8V5a1.2 1.2 0 0 1 1.2-1.2h2.6A1.2 1.2 0 0 1 14.5 5v1.8"/>
          <path d="M6.4 6.8l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12"/>
          <path d="M10.4 10.8v5.8M13.6 10.8v5.8"/>
        </svg>
        <span class="t">删除</span><span class="kbd k-del">⌫</span>
      </div>
    </div>

    <!-- 装选择：面板没变，每行换成「单选圈 + 名字」，底下压一排升序／降序 -->
    <div class="list list-choose">
      <div class="ttl">排序字段</div>
      <div class="opt"><span class="radio"></span><span class="ot">名称</span></div>
      <div class="opt on"><span class="radio"></span><span class="ot">修改时间</span></div>
      <div class="opt"><span class="radio"></span><span class="ot">文件大小</span></div>
      <div class="sort">
        <span class="sb">升序 ↑</span>
        <span class="sb on">降序 ↓</span>
      </div>
    </div>

  </div>
</div>`,
      css: `
/* 底：左边是被点的对象，右边是菜单，中间留一指宽 */
body{padding:24px;background:#f7f8fb}
.stage{display:flex;align-items:center;gap:18px}

/* 触发对象：一张浅蓝的文件卡。指针停在右上角，那里就是菜单的出生点 */
.target{position:relative;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:12px;width:120px;height:104px;
        border-radius:12px;background:#eceffa;border:1px solid #e3e8f6}
.doc{width:34px;height:34px;flex:0 0 auto}
.fname{font-size:12.5px;line-height:1;color:#3c4254;white-space:nowrap}
.cursor{position:absolute;top:-9px;right:-8px;width:21px;height:21px;color:#1b1f28;
        filter:drop-shadow(0 1px 2px rgba(20,24,40,.22))}
.cursor path{stroke:#fff;stroke-width:1.5;stroke-linejoin:round}

.menu{
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 26px -8px rgba(20,24,40,.22),0 1px 3px rgba(20,24,40,.06);
}

.list{display:flex;flex-direction:column}
.list-choose{display:none}

.row{
  display:flex;align-items:center;gap:9px;height:var(--row);padding:0 9px;
  border-radius:7px;
}
.ic{width:16px;height:16px;flex:0 0 auto;color:#7b8394}
.t{font-size:13px;font-weight:500;color:#242a36;white-space:nowrap}
.kbd{margin-left:auto;font:500 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
     color:#a3a9b7}
/* 退格那个符号在等宽字体里天生偏小，换回正文字体才和上面几行等高 */
.k-del{font-family:inherit;font-size:15px}

/* 复制那行：整条铺蓝，连图标和快捷键一起 —— 它标的是「刚点了这一下」 */
.row.on{background:#e3edfd}
.row.on .ic,.row.on .t,.row.on .kbd{color:#2b6ef0}
.row.danger .ic,.row.danger .t{color:#d9453a}

/* ── 装选择 ─────────────────────────────────────────────── */
.ttl{padding:3px 9px 7px;font-size:11.5px;letter-spacing:.06em;color:#a3a9b7}
.opt{display:flex;align-items:center;gap:9px;height:31px;padding:0 9px;border-radius:7px}
.radio{display:grid;place-items:center;width:14px;height:14px;flex:0 0 auto;
       border-radius:50%;border:1.5px solid #ccd1dc;background:#fff}
.ot{font-size:13px;color:#242a36;white-space:nowrap}
.opt.on .radio{border-color:#2b6ef0;background:#2b6ef0}
.opt.on .radio::after{content:"";width:5px;height:5px;border-radius:50%;background:#fff}
.opt.on .ot{color:#2b6ef0;font-weight:500}

/* 升／降是一排两个按钮：它们修饰上面选中的那一项，不是第四个选项 */
.sort{display:flex;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #eef0f5}
.sb{flex:1;height:30px;display:grid;place-items:center;border-radius:8px;
    background:#f2f4f8;color:#4d5566;font-size:12.5px;font-weight:500}
.sb.on{background:#2b6ef0;color:#fff}

/* ── 悬停：整行铺一层底，不是只换个字色 ────────────────────── */
body[data-state="hover"] .list-action .row:nth-child(3){background:#f2f4f8}

/* ── 装选择：面板不动，只换里面那一列 ──────────────────────── */
body[data-state="chooser"] .list-action{display:none}
body[data-state="chooser"] .list-choose{display:flex}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#0f1116}
body[data-theme="dark"] .target{background:#1b2130;border-color:#2a3242}
body[data-theme="dark"] .fname{color:#cfd4e0}
body[data-theme="dark"] .cursor{color:#eef0f6}
body[data-theme="dark"] .cursor path{stroke:#141924}
body[data-theme="dark"] .menu{background:#191d25;box-shadow:0 12px 26px -8px rgba(0,0,0,.7)}
body[data-theme="dark"] .t,body[data-theme="dark"] .ot{color:#e6e9f1}
body[data-theme="dark"] .ic{color:#8b93a5}
body[data-theme="dark"] .kbd,body[data-theme="dark"] .ttl{color:#767e90}
body[data-theme="dark"] .row.on{background:#1c3357}
body[data-theme="dark"] .row.on .ic,
body[data-theme="dark"] .row.on .t,
body[data-theme="dark"] .row.on .kbd{color:#79a8ff}
body[data-theme="dark"] .row.danger .ic,body[data-theme="dark"] .row.danger .t{color:#f08d82}
body[data-theme="dark"] .radio{border-color:#3a4354;background:#191d25}
body[data-theme="dark"] .opt.on .radio{border-color:#5b95ff;background:#5b95ff}
body[data-theme="dark"] .opt.on .ot{color:#79a8ff}
body[data-theme="dark"] .sort{border-top-color:#262c38}
body[data-theme="dark"] .sb{background:#232935;color:#b9c0ce}
body[data-theme="dark"] .sb.on{background:#2b6ef0;color:#fff}
body[data-theme="dark"][data-state="hover"] .list-action .row:nth-child(3){background:#232935}
`
    },
    {
      /* 02 分裂按钮。左边是主动作，右边那小块才是菜单的入口 —— 两个点击区，
       * 一块做「默认那件事」（直接导出 PDF），一块做「换一种做法」。
       * 菜单挂在按钮正下方而不是贴着指针：它属于这个按钮，不属于鼠标位置。
       * 主按钮绿实底白字，那是这个工作台里「导出」的固定色；箭头区留白，
       * 好让它一眼看出是另一次点击，而不是同一个按钮的右半边。 */
      id: "menu-split-button",
      name: "分裂按钮菜单",
      tags: ["部件", "菜单", "分裂按钮", "场景", "工作台"],
      summary: "一个绿色实底的主按钮「导出 PDF」，右边接一块白色的箭头区，两半各有自己的点击区；面板挂在按钮正下方，三项换一种导出做法，底下一行「查看全部导出」收口。",
      note: "两块点击区必须各自独立命中，别做成一个大按钮 —— 否则点右边随手就触发了左边的导出。菜单挂按钮下方而不是贴指针：它属于这个按钮，跟着按钮走。底部那条「查看全部导出」是收口，不是装饰，没有它用户会以为导出只有这三种。箭头区别跟着染绿：它一绿就成了主按钮的右半边，两个动作又混回一个。",
      ref: "img/menu-02-split-button.jpg",
      previewVw: 320,
      previewVh: 280,
      states: [
        { id: "open",   label: "展开" },
        { id: "closed", label: "收起" }
      ],
      metrics: [
        { label: "按钮高", value: "44px" },
        { label: "面板宽", value: "264px" },
        { label: "项高",   value: "36px" },
        { label: "箭头区", value: "44 × 44" },
        { label: "圆角",   value: "10px" },
        { label: "主色",   value: "#17795b" }
      ],
      params: [
        { name: "h", label: "按钮高", min: 32, max: 52, step: 1, value: 44,  unit: "px" },
        { name: "w", label: "面板宽", min: 220, max: 320, step: 4, value: 264, unit: "px" },
        { name: "r", label: "圆角",   min: 6,  max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="split">

  <!-- 两块点击区并排：左边绿实底做默认动作，右边留白只管开菜单 -->
  <div class="btn">
    <span class="main">导出 PDF</span>
    <span class="arrow">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9.5l6 5.5 6-5.5"/>
      </svg>
    </span>
  </div>

  <div class="panel">
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>
      </svg>
      <span class="t">导出 PNG</span>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>
      </svg>
      <span class="t">导出 SVG</span>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10.2 13.8a3.4 3.4 0 0 1 0-4.8l2.6-2.6a3.4 3.4 0 0 1 4.8 4.8l-1.3 1.3"/>
        <path d="M13.8 10.2a3.4 3.4 0 0 1 0 4.8l-2.6 2.6a3.4 3.4 0 0 1-4.8-4.8l1.3-1.3"/>
      </svg>
      <span class="t">复制导出链接</span>
    </div>

    <div class="sep"></div>
    <div class="pf">
      <span class="fl">查看全部导出</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h13m0 0l-5-5m5 5l-5 5"/>
      </svg>
    </div>
  </div>

</div>`,
      css: `
body{flex-direction:column;align-items:center;justify-content:center;background:#f4f5f7}

.split{width:var(--w);display:flex;flex-direction:column}

/* 按钮：整块一个圆角，里面的绿与白各占一半的点击区 */
.btn{display:flex;align-items:stretch;height:var(--h);border-radius:var(--r);
     background:#fff;overflow:hidden;
     box-shadow:0 1px 3px rgba(20,24,40,.14),0 1px 2px rgba(20,24,40,.08)}
.main{flex:1 1 auto;display:flex;align-items:center;padding:0 16px;
      background:#17795b;color:#fff;font-size:14.5px;font-weight:600;white-space:nowrap}
/* 箭头区：自己的点击区，白色，宽度与高度相等 —— 它不是主按钮的一部分 */
.arrow{flex:0 0 auto;width:var(--h);display:grid;place-items:center;
       background:#fff;color:#5c6370}
.arrow svg{width:16px;height:16px}

.panel{
  margin-top:8px;padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 28px -8px rgba(20,24,40,.18),0 2px 5px rgba(20,24,40,.06);
}
.row{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.ic{width:16px;height:16px;flex:0 0 auto;color:#5f6878}
.t{font-size:13.5px;font-weight:500;color:#2b3240;white-space:nowrap}
.sep{height:1px;margin:5px 6px;background:#eaecf0}

/* 底部收口：一条文字链，不是第四种做法 */
.pf{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;color:#17795b}
.fl{font-size:13px;font-weight:500}
.pf svg{width:14px;height:14px}

/* ── 收起：按钮还在，面板收走 ──────────────────────────────── */
body[data-state="closed"] .panel{display:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .btn{box-shadow:0 1px 3px rgba(0,0,0,.6)}
body[data-theme="dark"] .main{background:#0f6049}
body[data-theme="dark"] .arrow{background:#232f3f;color:#c3cbd8}
body[data-theme="dark"] .panel{background:#1d2939;box-shadow:0 12px 28px -8px rgba(0,0,0,.7)}
body[data-theme="dark"] .t{color:#f2f4f7}
body[data-theme="dark"] .ic{color:#98a2b3}
body[data-theme="dark"] .sep{background:#344054}
body[data-theme="dark"] .pf{color:#4ed6a8}
`
    },
    {
      /* 03 环形菜单。指针按下去的地方就是圆心，五个扇区等分一圈，每个扇区里
       * 两个字 —— 不是图标。手不用离开原位就能挑一个，代价是它读起来没有列表
       * 快：列表能扫，环形只能一个个看。所以扇区五个就到顶，字也不许再长。
       * 中心那块是读数：写着此刻指着的那一格，指到哪格，哪格整块变紫。 */
      id: "menu-radial",
      name: "环形操作菜单",
      tags: ["部件", "菜单", "环形菜单"],
      summary: "五个等分扇区围成一圈，每格两个字，中心一块深色圆写着当前指着的那一个。指针滑到哪一格，哪一格就整块填成紫色，中间的名字同时换成它。",
      note: "五格是上限：再切下去每格的弧只够放一个字，字一挤认读就变成猜。别把长标签塞进来 —— 三个字在 72° 的弧上就开始转到边上、跟着圆弧歪掉，两个字正好。它也不是常用菜单：常用操作放进来等于让每次点击都变成一次瞄准，该留在列表里。",
      ref: "img/menu-03-radial.jpg",
      previewVw: 300,
      previewVh: 300,
      states: [
        { id: "default", label: "指着编辑" },
        { id: "active",  label: "指向删除" }
      ],
      metrics: [
        { label: "直径",   value: "240px" },
        { label: "环宽",   value: "44px" },
        { label: "扇区",   value: "5 等分 · 72°" },
        { label: "中心圆", value: "96px" },
        { label: "标签",   value: "13px · 两字" },
        { label: "指向色", value: "#7c5cff" }
      ],
      params: [
        { name: "size", label: "直径", min: 180, max: 280, step: 4, value: 240, unit: "px" },
        { name: "ring", label: "环宽", min: 32,  max: 56,  step: 2, value: 44,  unit: "px" }
      ],
      html: `
<div class="wheel">
  <svg class="ring" viewBox="0 0 240 240" aria-hidden="true">

    <!-- 一圈五个扇区。stroke-dasharray 会沿整圆重复铺，所以每个 circle 只画一段：
         段长 114、剩下的整圈用 489 当 gap 吃掉；五个 g 各转 72° 铺开，
         段内的弧再退 124° 把这段的中心对到正上方，正好压在文字底下。 -->
    <g class="seg" transform="rotate(0 120 120)">
      <circle class="arc" cx="120" cy="120" r="96" transform="rotate(-124 120 120)"/>
      <g transform="translate(120 24)"><text class="lbl" transform="rotate(0)">复制</text></g>
    </g>

    <!-- 删除：默认跟别格一样，指到它时整段填紫（seg-hot 接 body[data-state="active"]） -->
    <g class="seg seg-hot" transform="rotate(72 120 120)">
      <circle class="arc" cx="120" cy="120" r="96" transform="rotate(-124 120 120)"/>
      <g transform="translate(120 24)"><text class="lbl" transform="rotate(-72)">删除</text></g>
    </g>

    <g class="seg" transform="rotate(144 120 120)">
      <circle class="arc" cx="120" cy="120" r="96" transform="rotate(-124 120 120)"/>
      <g transform="translate(120 24)"><text class="lbl" transform="rotate(-144)">移动</text></g>
    </g>

    <g class="seg" transform="rotate(216 120 120)">
      <circle class="arc" cx="120" cy="120" r="96" transform="rotate(-124 120 120)"/>
      <g transform="translate(120 24)"><text class="lbl" transform="rotate(-216)">旋转</text></g>
    </g>

    <g class="seg" transform="rotate(288 120 120)">
      <circle class="arc" cx="120" cy="120" r="96" transform="rotate(-124 120 120)"/>
      <g transform="translate(120 24)"><text class="lbl" transform="rotate(-288)">编辑</text></g>
    </g>

    <!-- 中心：手指按在圆心，那里不该有东西被按住，只放一个读数的名字 -->
    <circle class="hub" cx="120" cy="120" r="48"/>
    <text class="hubt hubt-edit" x="120" y="120">编辑</text>
    <text class="hubt hubt-del" x="120" y="120">删除</text>
  </svg>
</div>`,
      css: `
body{padding:24px;background:#1b2331}

.wheel{width:var(--size);height:var(--size)}
.ring{width:100%;height:100%;display:block}

/* 一段弧：dasharray 写成「段长 大 gap」，gap 吃掉剩下的一整圈，
   所以一个 circle 只出现一次，五段靠五个 g 的旋转拼出来 */
.arc{fill:none;stroke:#2b3546;stroke-width:var(--ring);stroke-dasharray:114 489}

/* 标签反着转回来，永远正着站 —— 扇区转了，字不跟着歪 */
.lbl{font-size:13px;fill:#dfe4ee;letter-spacing:.04em;
     text-anchor:middle;dominant-baseline:central}

.hub{fill:#141b26;stroke:rgba(255,255,255,.07);stroke-width:1}
.hubt{font-size:15px;font-weight:600;fill:#fff;letter-spacing:.06em;
      text-anchor:middle;dominant-baseline:central}
.hubt-del{display:none}

/* ── 指向删除：整段填紫，中心的名字换成它 ───────────────────── */
body[data-state="active"] .seg-hot .arc{stroke:#7c5cff}
body[data-state="active"] .seg-hot .lbl{fill:#fff;font-weight:600}
body[data-state="active"] .hubt-edit{display:none}
body[data-state="active"] .hubt-del{display:block}

/* ── 暗色：本来就在深色上，把底再压下去，让环浮起来 ─────────── */
body[data-theme="dark"]{background:#0b0f15}
body[data-theme="dark"] .arc{stroke:#232b39}
body[data-theme="dark"] .lbl{fill:#c9d0dd}
body[data-theme="dark"] .hub{fill:#0a0e14;stroke:rgba(255,255,255,.05)}
body[data-theme="dark"][data-state="active"] .seg-hot .arc{stroke:#8b70ff}
`
    },
    {
      /* 04 底部操作单。整块从屏幕下沿升起，白卡片压在浅灰的页面上，圆角比别处
       * 都大，行高也高 —— 因为它是给拇指点的，不是给鼠标点的。
       * 内容全部居中：一句小字说清对象，两个动作，一道线，然后是取消。
       * 取消单独成行且隔着线：它不是第 N 个动作，是「不做」。 */
      id: "menu-action-sheet",
      name: "底部操作单",
      tags: ["部件", "菜单", "底部操作单"],
      summary: "浅灰页面上压着一条灰色页头，代表被遮住的那一页；白色大圆角卡片从下沿升起，字全部居中：一句小灰字交代对象，两个动作一蓝一黑，一道分隔线之后是灰色的取消。",
      note: "行数别超过六行 —— 它从下沿升起，长了就把上半屏全遮住，用户看不见自己刚点的东西。别塞表单进去：它是「做一件」的清单，不是录入区。取消必须单独一行、并且和上面隔一道线：底部弹层只剩一片遮罩可点，没有明确出口时人只能乱点；但也别把它混进动作里，它不是第三个动作。",
      ref: "img/menu-04-action-sheet.jpg",
      previewVw: 360,
      previewVh: 330,
      states: [
        { id: "default", label: "升起" },
        { id: "press",   label: "按住分享" }
      ],
      metrics: [
        { label: "卡片宽", value: "300px" },
        { label: "行高",   value: "52px" },
        { label: "圆角",   value: "18px" },
        { label: "遮罩页", value: "高 64px" },
        { label: "提示字", value: "12px 居中" },
        { label: "内距",   value: "10px" }
      ],
      params: [
        { name: "w",   label: "卡片宽", min: 260, max: 360, step: 4, value: 300, unit: "px" },
        { name: "row", label: "行高",   min: 44,  max: 62,  step: 1, value: 52,  unit: "px" },
        { name: "r",   label: "圆角",   min: 12,  max: 24,  step: 1, value: 18,  unit: "px" }
      ],
      html: `
<div class="phone">

  <!-- 被遮住的那一页：只剩顶上一条，说明底下还有东西，但点不到 -->
  <div class="behind">
    <span class="bname">项目文件</span>
    <span class="bpill"></span>
  </div>

  <div class="sheet">
    <span class="grip"></span>
    <div class="cap">对文件执行操作</div>

    <div class="row share">分享文件</div>
    <div class="row">保存副本</div>

    <div class="sep"></div>
    <div class="row cancel">取消</div>
  </div>

</div>`,
      css: `
/* 底：浅灰，像被遮罩压暗一层的页面，不是深色相册 */
body{flex-direction:column;justify-content:center;padding:24px;background:#f2f2f5}

.phone{width:var(--w);display:flex;flex-direction:column}

/* 页头：代表被遮住的那一页。它不参与点击，只交代「底下有东西」 */
.behind{height:64px;display:flex;align-items:center;justify-content:space-between;
        padding:0 16px;border-radius:14px;background:#dcdee8}
.bname{font-size:14px;color:#5c6072;white-space:nowrap}
.bpill{width:58px;height:9px;border-radius:5px;background:#c3c6d4}

/* 卡片：负 12 往上压，压住页头的下沿 —— 它是盖上去的，不是接在底下的 */
.sheet{margin-top:-12px;padding:8px 10px;border-radius:var(--r);background:#fff;
       box-shadow:0 -4px 24px -8px rgba(24,28,42,.2)}
.grip{display:block;width:32px;height:4px;margin:0 auto 4px;border-radius:2px;background:#d6d8e0}
.cap{padding:6px 0 10px;font-size:12px;color:#9a9eab;text-align:center}

/* 每行都是一个整宽的落点，字居中；拇指从上往下划，先碰到的是最常用的那个 */
.row{display:flex;align-items:center;justify-content:center;height:var(--row);
     border-radius:12px;font-size:15px;font-weight:500;color:#20232c;white-space:nowrap}
.row.share{color:#2b6ef0}
.row.cancel{color:#6b7080}

/* 分隔线：取消和上面两个动作不是一类事 */
.sep{height:1px;margin:4px 0;background:#eceef2}

/* ── 按住：整行淡灰，是给手指的落点回执 ───────────────────── */
body[data-state="press"] .row.share{background:#f2f3f6}

/* ── 暗色：卡片沉下去，页头跟着暗，仍然是「一层盖一层」 ─────── */
body[data-theme="dark"]{background:#0b0c10}
body[data-theme="dark"] .behind{background:#1a1c22}
body[data-theme="dark"] .bname{color:#7f8598}
body[data-theme="dark"] .bpill{background:#2b2e39}
body[data-theme="dark"] .sheet{background:#26272f;box-shadow:0 -6px 28px -8px rgba(0,0,0,.8)}
body[data-theme="dark"] .grip{background:#43464f}
body[data-theme="dark"] .cap{color:#868c9c}
body[data-theme="dark"] .row{color:#edeef3}
body[data-theme="dark"] .row.share{color:#6fa3ff}
body[data-theme="dark"] .row.cancel{color:#959bab}
body[data-theme="dark"] .sep{background:#363943}
body[data-theme="dark"][data-state="press"] .row.share{background:#31333c}
`
    },
    {
      /* 05 命令面板。不挂在任何一个按钮下面，它浮在屏幕正中，因为那一下是
       * 「我要找个别的事做」。输入行右侧的 ⌘K 是它的另一个入口 —— 全局快捷键；
       * 结果按来源分组，选中的那条垫浅紫、右侧给 Enter；底部一行小字把键位
       * 交代给第一次打开的人。 */
      id: "menu-command-palette",
      name: "命令面板",
      tags: ["部件", "菜单", "命令面板", "场景", "工作台"],
      summary: "浮在屏幕正中，不挂在任何按钮下面。最上面一行是输入，右侧挂着 ⌘K；下面按「外观」这样的来源分组，每行是图标 + 命令名，选中的那条垫浅紫、右侧给 Enter，面板底部一行小灰字写明键位。",
      note: "命令面板是全屏浮层，没有地方可点空，必须有 Esc 收口 —— 底部那行键位提示顺便把这件事讲给了用户。结果要分组：一个平铺的 20 条命令列表等于没有结构，标题那行小字是唯一的分层手段。别把设置项塞进来：它装的是「做一件事」，装了开关就成了设置页的影子。",
      ref: "img/menu-05-command-palette.jpg",
      previewVw: 620,
      previewVh: 330,
      states: [
        { id: "typing", label: "输入中" },
        { id: "empty",  label: "未输入" }
      ],
      metrics: [
        { label: "面板宽", value: "560px" },
        { label: "输入行", value: "52px" },
        { label: "项高",   value: "44px" },
        { label: "提示行", value: "11px 小灰字 · 上边框隔开" },
        { label: "圆角",   value: "12px" },
        { label: "高亮",   value: "浅紫底 #f0edfe · 紫字 #7c5cff" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 440, max: 660, step: 10, value: 560, unit: "px" },
        { name: "row", label: "项高",   min: 36,  max: 54,  step: 1,  value: 44,  unit: "px" },
        { name: "r",   label: "圆角",   min: 8,   max: 18,  step: 1,  value: 12,  unit: "px" }
      ],
      html: `
<div class="palette">

  <!-- 输入行：默认是打字中的形态，右侧 ⌘K 提醒它有全局快捷键这回事 -->
  <div class="input">
    <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7"/><path d="M16.2 16.2L21 21"/>
    </svg>
    <span class="ph">搜索命令…</span>
    <span class="typed">切换主题<span class="caret"></span></span>
    <span class="kbd">⌘ K</span>
  </div>

  <div class="grp">
    <div class="gh">外观</div>
    <div class="row on">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
      </svg>
      <span class="t">切换为浅色</span>
      <span class="ent">Enter</span>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
      </svg>
      <span class="t">切换为深色</span>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
      </svg>
      <span class="t">跟随系统</span>
    </div>
  </div>

  <!-- 底部提示行：把键位交代出来，也给 Esc 一个明面上的出口 -->
  <div class="hint">↑↓ 选择 · Enter 执行 · Esc 关闭</div>

</div>`,
      css: `
body{background:#f6f4f1}

.palette{
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 24px 56px -12px rgba(40,35,25,.22),0 4px 10px rgba(40,35,25,.06);
}

/* 输入行在最上面，下面那道线是它与结果的分界 */
.input{display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;
       border-bottom:1px solid #eee9e1}
.input .ic{width:18px;height:18px;flex:0 0 auto;color:#a29b8f}
.ph{display:none;font-size:14px;color:#a29b8f}
.typed{display:flex;align-items:center;font-size:14px;color:#3d3830}
.caret{display:inline-block;width:2px;height:15px;margin-left:2px;
       vertical-align:-2px;background:#7c5cff}
.kbd{margin-left:auto;flex:0 0 auto;font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
     color:#8a8478;padding:4px 6px;border-radius:5px;background:#f1eee8}

.grp{padding:6px 0}
.gh{padding:6px 12px 4px;font-size:11px;font-weight:600;color:#a29b8f}
.row{display:flex;align-items:center;gap:10px;height:var(--row);padding:0 12px;
     border-radius:calc(var(--r) - 5px)}
.row .ic{width:15px;height:15px;flex:0 0 auto;color:#8a8478}
.t{font-size:14px;font-weight:500;color:#44403a;white-space:nowrap}
/* 选中项：浅紫底 + 紫字，右侧的 Enter 是「现在敲回车执行的是它」的凭据 */
.row.on{background:#f0edfe}
.row.on .t{color:#7c5cff}
.row.on .ic{color:#7c5cff}
.ent{margin-left:auto;flex:0 0 auto;font-size:11px;font-weight:600;color:#7c5cff;
     padding:3px 8px;border-radius:5px;background:#e5defd}

.hint{margin-top:4px;padding:9px 12px 5px;border-top:1px solid #eee9e1;
      font-size:11px;color:#a29b8f}

/* ── 未输入：占位回来，预选撤掉 —— 没输入就没有「最匹配的那条」，
      硬选一条会让人以为敲回车执行的是它 ────────────────────────── */
body[data-state="empty"] .ph{display:block}
body[data-state="empty"] .typed{display:none}
body[data-state="empty"] .row.on{background:transparent}
body[data-state="empty"] .row.on .t{color:#44403a}
body[data-state="empty"] .row.on .ic{color:#8a8478}
body[data-state="empty"] .ent{display:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#201d18}
body[data-theme="dark"] .palette{background:#2a2620;box-shadow:0 24px 56px -12px rgba(0,0,0,.6)}
body[data-theme="dark"] .input{border-bottom-color:#3d382f}
body[data-theme="dark"] .input .ic{color:#8a8478}
body[data-theme="dark"] .ph{color:#8a8478}
body[data-theme="dark"] .typed{color:#ece5d8}
body[data-theme="dark"] .kbd{background:#332f27;color:#a29b8f}
body[data-theme="dark"] .gh{color:#8a8478}
body[data-theme="dark"] .t{color:#d8d2c6}
body[data-theme="dark"] .row .ic{color:#8a8478}
body[data-theme="dark"] .row.on{background:#37315a}
body[data-theme="dark"] .row.on .t{color:#b3a1ff}
body[data-theme="dark"] .row.on .ic{color:#b3a1ff}
body[data-theme="dark"] .ent{background:#453d75;color:#c3b5ff}
body[data-theme="dark"] .hint{border-top-color:#3d382f;color:#8a8478}
body[data-theme="dark"][data-state="empty"] .row.on{background:transparent}
body[data-theme="dark"][data-state="empty"] .row.on .t{color:#d8d2c6}
body[data-theme="dark"][data-state="empty"] .row.on .ic{color:#8a8478}
`
    },
    {
      /* 06 巨型菜单。它不是「一个菜单」，是「一整页导航的缩略图」：顶栏一个
       * 当前项，下面整块面板横跨页面，里面并排几栏纯文字条目，右侧一块浅紫的
       * 资源卡收尾。导航项多到一栏装不下时，与其让它们排成长队，不如摊平了
       * 让人一眼看完。 */
      id: "menu-mega",
      name: "多栏巨型菜单",
      tags: ["部件", "菜单", "巨型菜单", "场景", "导航"],
      summary: "顶栏一个当前项（加粗、带下拉箭头），下面整块面板横跨页面：并排三栏纯文字条目，栏与栏之间一道细线，每栏一个标题带三个条目，右侧一块浅紫底的「组件资源库」卡收尾。",
      note: "只在大站的整站导航上用它 —— 三栏加一张资源卡已经看着很宽，条目少于十个就会显得空。栏目数超过四个就别再加了：摊平的优势是能一眼扫完，再多一眼扫不完，退化成一张大表。别在移动上用它，宽度不够，摊不平。",
      ref: "img/menu-06-mega.jpg",
      previewVw: 720,
      previewVh: 280,
      states: [
        { id: "default", label: "展开" },
        { id: "hover",   label: "指向一项" }
      ],
      metrics: [
        { label: "顶栏高", value: "46px" },
        { label: "面板宽", value: "660px" },
        { label: "项高",   value: "34px" },
        { label: "内距",   value: "20px" },
        { label: "圆角",   value: "12px" },
        { label: "资源卡", value: "浅紫底 #ece7fd · 紫字 #6d4aff" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 520, max: 800, step: 10, value: 660, unit: "px" },
        { name: "gap", label: "栏间距", min: 12,  max: 40,  step: 2,  value: 24,  unit: "px" },
        { name: "r",   label: "圆角",   min: 8,   max: 18,  step: 1,  value: 12,  unit: "px" }
      ],
      html: `
<!-- 顶栏：当前项加粗带箭头，其余两项平着摆 -->
<div class="nav">
  <span class="nav-it cur">设计工具
    <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9.5l6 5.5 6-5.5"/>
    </svg>
  </span>
  <span class="nav-it">文档</span>
  <span class="nav-it">定价</span>
</div>

<!-- 面板：三栏纯文字条目，栏间一道细线，右侧一张资源卡 -->
<div class="mega">
  <div class="col">
    <div class="ch">设计工具</div>
    <div class="it">画布编辑</div>
    <div class="it">原型预览</div>
    <div class="it">资源管理</div>
  </div>
  <div class="col">
    <div class="ch">协作功能</div>
    <div class="it hl">团队空间</div>
    <div class="it">版本历史</div>
    <div class="it">评论反馈</div>
  </div>
  <div class="col">
    <div class="ch">学习资源</div>
    <div class="it">帮助文档</div>
    <div class="it">组件示例</div>
    <div class="it">更新日志</div>
  </div>
  <div class="promo">
    <svg class="pico" viewBox="0 0 24 24" aria-hidden="true">
      <rect class="pcard" x="3" y="4.5" width="18" height="15" rx="3"/>
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" fill="none" stroke="#8f7bf0"
            stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span class="pt">组件资源库</span>
  </div>
</div>`,
      css: `
body{flex-direction:column;gap:12px;background:#f6f4f1}

/* 顶栏：与面板同宽，当前项一眼认出 —— 加粗、着色、带下拉箭头 */
.nav{display:flex;align-items:center;gap:28px;width:var(--w);height:46px;
     padding:0 20px;border-radius:calc(var(--r) - 2px);background:#fff;
     box-shadow:0 1px 3px rgba(40,35,25,.08)}
.nav-it{display:flex;align-items:center;gap:5px;font-size:13.5px;color:#6b6559}
.nav-it.cur{font-weight:600;color:#4263eb}
.cv{width:14px;height:14px}

.mega{
  display:flex;width:var(--w);padding:20px;border-radius:var(--r);background:#fff;
  box-shadow:0 20px 44px -12px rgba(40,35,25,.16),0 4px 10px rgba(40,35,25,.06);
}
/* 栏目之间那道细线：栏是并列的类别，不是一栏里的一串 */
.col{flex:1 1 0;min-width:0}
.col + .col{border-left:1px solid #eceae4;padding-left:var(--gap)}
.ch{margin-bottom:8px;font-size:14px;font-weight:600;color:#3d3830}
/* 条目是纯文字行：栏内不摆图标不摆色块，扫起来最快 */
.it{height:34px;line-height:34px;padding:0 8px;border-radius:8px;
    font-size:13.5px;color:#5c574e;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}

/* 资源卡：整块浅紫，图标加文字居中 —— 它不是第五栏，是这块面板的出口广告 */
.promo{margin-left:var(--gap);flex:0 0 auto;align-self:stretch;width:150px;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       gap:9px;border-radius:10px;background:#ece7fd}
.pico{width:44px;height:44px}
.pico .pcard{fill:#fff}
.pt{font-size:13px;font-weight:600;color:#6d4aff}

/* ── 指向一项：只亮那一项，别整栏一起亮 ──────────────────── */
body[data-state="hover"] .it.hl{background:#f1eee8}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#201d18}
body[data-theme="dark"] .nav{background:#2a2620;box-shadow:0 1px 3px rgba(0,0,0,.4)}
body[data-theme="dark"] .nav-it{color:#a29b8f}
body[data-theme="dark"] .nav-it.cur{color:#7b93f5}
body[data-theme="dark"] .mega{background:#2a2620;box-shadow:0 20px 44px -12px rgba(0,0,0,.55)}
body[data-theme="dark"] .col + .col{border-left-color:#3d382f}
body[data-theme="dark"] .ch{color:#ece5d8}
body[data-theme="dark"] .it{color:#c9c2b4}
body[data-theme="dark"] .promo{background:#37315a}
body[data-theme="dark"] .pico .pcard{fill:#332f4d}
body[data-theme="dark"] .pico path{stroke:#b3a1ff}
body[data-theme="dark"] .pt{color:#b3a1ff}
body[data-theme="dark"][data-state="hover"] .it.hl{background:#3d382f}
`
    },
    {
      /* 07 多级飞出菜单。主菜单在左，鼠标扫过去的那一项右边立刻长出第二块，
       * 两块并排摆着。与逐级钻取的区别就在这：钻取是同一块面板换内容，飞出是
       * 两块同时在屏幕上 —— 你能看见自己从哪来。 */
      id: "menu-flyout",
      name: "多级飞出菜单",
      tags: ["部件", "菜单", "多级飞出菜单", "场景", "导航"],
      summary: "主菜单在左，五项各配一枚小图标、右侧都留着小箭头；扫过的「导出」垫蓝高亮，右边立刻长出第二块面板，PNG / SVG / PDF 三项并排摆在屏幕上。",
      note: "只能开两级：第三块再往右飞，鼠标一路向右会走出屏幕，而且回来得重新扫一遍。两块之间留 2–4px，别贴死 —— 贴死看着像一块被切开的面板，留缝才知道是两块。别在触屏上用它：手指没有「路过」这个动作，扫过去就弹出来等于乱跳。",
      ref: "img/menu-07-flyout.jpg",
      previewVw: 500,
      previewVh: 240,
      states: [
        { id: "open",   label: "二级展开" },
        { id: "closed", label: "只有一级" }
      ],
      metrics: [
        { label: "单块宽", value: "220px" },
        { label: "项高",   value: "36px" },
        { label: "间隙",   value: "4px" },
        { label: "圆角",   value: "10px" },
        { label: "高亮",   value: "浅蓝底 #e8f1fe · 蓝字 #1570ef" },
        { label: "字",     value: "13.5px / 500" }
      ],
      params: [
        { name: "w",   label: "单块宽", min: 180, max: 260, step: 4, value: 220, unit: "px" },
        { name: "row", label: "项高",   min: 30,  max: 44,  step: 1, value: 36,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="fly">

  <div class="panel p1">
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14 3v5h5"/>
      </svg>
      <span class="t">文件</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17.2 3.8l3 3L8 19l-4 1 1-4z"/><path d="M14.5 6.5l3 3"/>
      </svg>
      <span class="t">编辑</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/>
        <rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>
      </svg>
      <span class="t">视图</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <!-- 扫过的这一项：垫蓝高亮，右边那块就是从它长出来的 -->
    <div class="row on">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/>
      </svg>
      <span class="t">导出</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <div class="row">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 7h9M19 7h1M4 17h3M13 17h7"/>
        <circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>
      </svg>
      <span class="t">设置</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
  </div>

  <div class="panel p2">
    <div class="row on"><span class="t">PNG 图片</span></div>
    <div class="row"><span class="t">SVG 矢量</span></div>
    <div class="row"><span class="t">PDF 文档</span></div>
  </div>

</div>`,
      css: `
body{background:#f6f4f1}

/* 两块之间那点缝是接缝的证明：贴死就成了一块被切开的面板 */
.fly{display:flex;gap:4px}

.panel{
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 28px -6px rgba(40,35,25,.16),0 2px 5px rgba(40,35,25,.06);
}
.row{display:flex;align-items:center;gap:9px;height:var(--row);padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.ic{width:16px;height:16px;flex:0 0 auto;color:#8a8478}
.t{font-size:13.5px;font-weight:500;color:#44403a;white-space:nowrap}
.ar{width:14px;height:14px;margin-left:auto;flex:0 0 auto;color:#a29b8f}
/* 高亮用蓝：扫到哪、从哪长出第二块，蓝是这条路径的颜色 */
.row.on{background:#e8f1fe}
.row.on .t{color:#1570ef}
.row.on .ic{color:#1570ef}
.row.on .ar{color:#1570ef}

/* ── 只有一级：右边那块整个收走，箭头还在 —— 还在这就说明有下一级 ── */
body[data-state="closed"] .p2{display:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#201d18}
body[data-theme="dark"] .panel{background:#2a2620;box-shadow:0 12px 28px -6px rgba(0,0,0,.55)}
body[data-theme="dark"] .t{color:#d8d2c6}
body[data-theme="dark"] .ic{color:#8a8478}
body[data-theme="dark"] .ar{color:#8a8478}
body[data-theme="dark"] .row.on{background:#1d3050}
body[data-theme="dark"] .row.on .t{color:#6aa8ff}
body[data-theme="dark"] .row.on .ic{color:#6aa8ff}
body[data-theme="dark"] .row.on .ar{color:#6aa8ff}
`
    },
    {
      /* 08 逐级钻取菜单。与飞出的区别是它只有一块面板：点进去，这块面板的
       * 内容整块换成下一级，左上角那把箭头变成返回。深度不限，代价是回不去
       * 只能一级级往回退 —— 所以它留着标题行，告诉人现在在哪一层，底部一行
       * 小字把「原地替换」这件事说明白。 */
      id: "menu-drilldown",
      name: "逐级钻取菜单",
      tags: ["部件", "菜单", "逐级钻取菜单", "场景", "导航"],
      summary: "只有一块面板：标题行写着现在在哪一层，往下的项右侧挂箭头；点进去整块换成下一级，左上角的箭头翻成返回并点亮，面板底部一行小灰字说明内容是原地替换的。",
      note: "深度可以不限，但每深一层就多一次返回，三级以上要先给个「全部」的出口。标题行不能省：没有它，进了第二层就不知道自己在哪、也不知道往回退一步退到哪。同一层里的项要么都能往下、要么都是终点，别混着来 —— 箭头是「还能往下」，没有箭头是「就到这」，混在一起会让人以为没箭头的也能点进去。",
      ref: "img/menu-08-drilldown.jpg",
      previewVw: 360,
      previewVh: 260,
      states: [
        { id: "level1", label: "第一级" },
        { id: "level2", label: "进去一层" }
      ],
      metrics: [
        { label: "面板宽", value: "300px" },
        { label: "标题行", value: "40px" },
        { label: "项高",   value: "40px" },
        { label: "返回键", value: "28px" },
        { label: "圆角",   value: "10px" },
        { label: "高亮",   value: "浅蓝底 #e8f1fe · 蓝字 #1570ef" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 240, max: 360, step: 4, value: 300, unit: "px" },
        { name: "row", label: "项高",   min: 34,  max: 48,  step: 1, value: 40,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="panel">

  <!-- 标题行：进了第二层，这行是唯一能告诉你「现在在哪」的东西 -->
  <div class="head">
    <span class="back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6"/>
      </svg>
    </span>
    <span class="ttl t1">全部资源</span>
    <span class="ttl t2">设计资源</span>
  </div>

  <div class="list l1">
    <div class="row on">
      <span class="t">设计资源</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <div class="row">
      <span class="t">项目文档</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
    <div class="row">
      <span class="t">团队资料</span>
      <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>
  </div>

  <!-- 第二级：标题换了，箭头换成返回，下面的项都是终点，不再挂箭头 -->
  <div class="list l2">
    <div class="row"><span class="t">图标库</span></div>
    <div class="row"><span class="t">插画素材</span></div>
    <div class="row"><span class="t">字体规范</span></div>
  </div>

</div>

<!-- 面板底下的说明：内容是原地替换的，返回入口一直在 -->
<div class="cap">内容在同一容器内替换，返回入口保留</div>`,
      css: `
body{flex-direction:column;gap:12px;background:#f6f4f1}

.panel{
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 28px -6px rgba(40,35,25,.16),0 2px 5px rgba(40,35,25,.06);
}
.head{display:flex;align-items:center;gap:8px;height:40px;padding:0 10px}
.back{display:grid;place-items:center;width:28px;height:28px;flex:0 0 auto;
      border-radius:8px;background:#f1eee8;color:#5c574e}
.back svg{width:15px;height:15px}
.ttl{font-size:13.5px;font-weight:600;color:#3d3830}
.t2{display:none}

.list{display:flex;flex-direction:column}
.l2{display:none}

.row{display:flex;align-items:center;gap:9px;height:var(--row);padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.t{font-size:13.5px;font-weight:500;color:#44403a;white-space:nowrap}
.ar{width:14px;height:14px;margin-left:auto;flex:0 0 auto;color:#a29b8f}
/* 有箭头是「还能往下」：当前扫到的这条垫蓝，第二块内容就从它长进去 */
.row.on{background:#e8f1fe}
.row.on .t{color:#1570ef}
.row.on .ar{color:#1570ef}

.cap{font-size:11.5px;color:#a29b8f}

/* ── 进去一层：标题换成当前层，整块内容换掉 ────────────────── */
body[data-state="level2"] .t1{display:none}
body[data-state="level2"] .t2{display:block}
body[data-state="level2"] .l1{display:none}
body[data-state="level2"] .l2{display:flex}
/* 返回键到这一级才真正有作用 —— 视觉上它一直都在，位置不能跳 */
body[data-state="level2"] .back{background:#e8f1fe;color:#1570ef}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#201d18}
body[data-theme="dark"] .panel{background:#2a2620;box-shadow:0 12px 28px -6px rgba(0,0,0,.55)}
body[data-theme="dark"] .ttl{color:#ece5d8}
body[data-theme="dark"] .t{color:#d8d2c6}
body[data-theme="dark"] .back{background:#3d382f;color:#c9c2b4}
body[data-theme="dark"] .ar{color:#8a8478}
body[data-theme="dark"] .row.on{background:#1d3050}
body[data-theme="dark"] .row.on .t{color:#6aa8ff}
body[data-theme="dark"] .row.on .ar{color:#6aa8ff}
body[data-theme="dark"] .cap{color:#8a8478}
body[data-theme="dark"][data-state="level2"] .back{background:#1d3050;color:#6aa8ff}
`
    },
    {
      /* 09 手风琴菜单。它不弹面板，就地展开：点「设计资源」，那一行下面长出
       * 「图标 / 插画 / 字体」，整块往下推；再点一次收回去，箭头跟着翻。
       * 展开的那一行换成浅蓝底蓝字 —— 展开是动作，高亮是「你现在在这一组」。
       * 缩进处那道细竖线是层级，不是装饰：子项没有它就跟一级项平起平坐。
       * 末尾没有「添加视图」那种收尾行，菜单到「项目设置」就结束。 */
      id: "menu-accordion",
      name: "手风琴菜单",
      tags: ["部件", "菜单", "手风琴菜单", "场景", "导航"],
      summary: "一条立在页面里的竖列表：一级项各占一行，「总览」右侧挂一个小宫格图标，其余右侧挂箭头；展开的那一项换成浅蓝底蓝字，下面缩进长出三个子项，子项左边压着一道细竖线，再隔一道线才是「项目设置」。",
      note: "同时只开一组：开着两组整块就顶到屏幕外，也丢掉了「现在在哪一组」的指认。子项必须缩进并带那道竖线 —— 一级项和子项长得一样时，读者只能靠上下位置猜层级，一滚动就猜错。它也不适合当主导航：主导航要一眼看全，摊开的骨架会让人以为每一项下面都还有一级；同理，别在展开项下面插别的控件，展开一次它们就被整排推走。",
      ref: "img/menu-09-accordion.jpg",
      previewVw: 300,
      previewVh: 300,
      states: [
        { id: "expanded", label: "展开一组" },
        { id: "flat",     label: "全部收起" }
      ],
      metrics: [
        { label: "容器宽", value: "244px" },
        { label: "一级项", value: "36px 高" },
        { label: "子项",   value: "30px 高" },
        { label: "缩进",   value: "18 · 线内缩 12" },
        { label: "圆角",   value: "10px" },
        { label: "字",     value: "13.5px / 500" }
      ],
      params: [
        { name: "w",   label: "容器宽", min: 200, max: 320, step: 4, value: 244, unit: "px" },
        { name: "row", label: "一级项高", min: 30, max: 48, step: 1, value: 36, unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16, step: 1, value: 10, unit: "px" }
      ],
      html: `
<div class="acc">

  <!-- 总览：这行不带下级，右侧给一个宫格图标当「它是全貌」的记号 -->
  <div class="row">
    <span class="t">总览</span>
    <svg class="grid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="6.6" height="6.6" rx="1.8"/>
      <rect x="13.9" y="3.5" width="6.6" height="6.6" rx="1.8"/>
      <rect x="3.5" y="13.9" width="6.6" height="6.6" rx="1.8"/>
      <rect x="13.9" y="13.9" width="6.6" height="6.6" rx="1.8"/>
    </svg>
  </div>

  <!-- 展开的一组：底变浅蓝、字变蓝，箭头朝上 -->
  <div class="row on">
    <span class="t">设计资源</span>
    <svg class="cv up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9.5l6 5.5 6-5.5"/>
    </svg>
  </div>

  <!-- 子项：整体缩进，左边那道细线才是层级 -->
  <div class="kids">
    <div class="kid"><span class="t">图标</span></div>
    <div class="kid"><span class="t">插画</span></div>
    <div class="kid"><span class="t">字体</span></div>
  </div>

  <!-- 隔一道线，回到和上面同级的一张脸 -->
  <div class="sep"></div>

  <div class="row">
    <span class="t">项目设置</span>
    <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9.5l6 5.5 6-5.5"/>
    </svg>
  </div>

</div>`,
      css: `
body{background:#f2f4f7}

.acc{
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 1px 3px rgba(16,24,40,.08);
}
.row{display:flex;align-items:center;gap:8px;height:var(--row);padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.t{font-size:13.5px;font-weight:500;color:#344054;white-space:nowrap}
.grid{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#98a2b3}
.cv{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#98a2b3}
.cv.up{transform:rotate(180deg);color:#2f6bff}

/* 展开项：底色只铺这一行，不是整组 —— 子项要靠底色退到后面去 */
.row.on{background:#eaf1ff}
.row.on .t{color:#2f6bff}

/* 子项缩进 18，线再往里 12：数字一变，子项就会贴着那条线，看着像被划掉 */
.kids{display:flex;flex-direction:column;margin:2px 0 4px 18px;
      padding-left:12px;border-left:1px solid #e4e7ec}
.kid{display:flex;align-items:center;height:30px;padding:0 8px;border-radius:6px}
.kid .t{font-weight:400;font-size:13px;color:#475467}

/* 分隔线要顶到面板两边：它切的是「两个区段」，不是两条行 */
.sep{height:1px;margin:5px -6px;background:#eaecf0}

/* ── 全部收起：子项收走，箭头翻回朝下，高亮留着 —— 组还在，只是关着 ── */
body[data-state="flat"] .kids{display:none}
body[data-state="flat"] .cv.up{transform:none;color:#2f6bff}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .acc{background:#1d2939;box-shadow:0 1px 3px rgba(0,0,0,.5)}
body[data-theme="dark"] .t{color:#f2f4f7}
body[data-theme="dark"] .grid{color:#98a2b3}
body[data-theme="dark"] .cv{color:#98a2b3}
body[data-theme="dark"] .row.on{background:rgba(47,107,255,.16)}
body[data-theme="dark"] .row.on .t{color:#84a9ff}
body[data-theme="dark"] .cv.up{color:#84a9ff}
body[data-theme="dark"] .kids{border-left-color:#344054}
body[data-theme="dark"] .kid .t{color:#cecfd4}
body[data-theme="dark"] .sep{background:#344054}
`
    },
    {
      /* 10 路径分支菜单。面包屑本身就是位置指示器，它弹出的那块面板不是「菜单」
       * 而是「这条路在这里分成几条」：点中间任何一级，都能不退回顶部就从那一
       * 级拐到别的分支上去。
       * 图上展开的是路径中间的一级 —— 所以「图标规范」还排在箭头后面，面板
       * 挂在「品牌设计」正下方：路径不断，只是从这一级岔出去。 */
      id: "menu-breadcrumb",
      name: "路径分支菜单",
      tags: ["部件", "菜单", "路径分支菜单", "场景", "导航"],
      summary: "顶上一排面包屑：工作空间 / 项目 / 品牌设计 ▾ / 图标规范，中间那一级是当前项，浅蓝底、带小箭头；点开在它正下方挂一块面板，列着这一级的四个同级去处，第一项带蓝色对勾表示现在在这里。",
      note: "层级超过四层就别全摆出来了：中间那几级会被挤成一串「…」，而那串省略号里藏着的正是位置，等于没有位置。路径必须是真路径 —— 每一级都点得回去，摆一串点不动的文字是在骗人。最后一级（这里是「图标规范」）不挂箭头：它已经是当前页，展开出来还是它自己。面板只列同级，别把下级也塞进来，否则「换一条路」和「往下走」两种动作混在一起。",
      ref: "img/menu-10-breadcrumb.jpg",
      previewVw: 400,
      previewVh: 270,
      states: [
        { id: "open",   label: "展开分支" },
        { id: "closed", label: "只有路径" }
      ],
      metrics: [
        { label: "路径条", value: "38px 高" },
        { label: "面板宽", value: "200px" },
        { label: "项高",   value: "36px" },
        { label: "内距",   value: "6px" },
        { label: "圆角",   value: "10px" },
        { label: "字",     value: "13px / 500" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 168, max: 260, step: 4, value: 200, unit: "px" },
        { name: "row", label: "项高",   min: 30,  max: 44,  step: 1, value: 36,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="bar">

  <span class="seg">工作空间</span>
  <span class="sl">/</span>
  <span class="seg">项目</span>
  <span class="sl">/</span>

  <!-- 展开点：路径中间这一级。面板就挂在它正下方，路径本身不断。 -->
  <span class="drop">
    <span class="seg cur">
      品牌设计
      <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9.5l6 5.5 6-5.5"/>
      </svg>
    </span>

    <div class="panel">
      <div class="row on">
        <span class="t">品牌设计</span>
        <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7"/>
        </svg>
      </div>
      <div class="row"><span class="t">应用界面</span></div>
      <div class="row"><span class="t">营销素材</span></div>
      <div class="row"><span class="t">归档项目</span></div>
    </div>
  </span>

  <span class="sl">/</span>
  <span class="seg last">图标规范</span>

</div>`,
      css: `
/* 路径条钉在页面顶部 —— 它报的是「这是哪一页」，居中就成了一个飘着的控件；
   面板挂在路径下面，靠绝对定位，收起来时路径条不会跳位置。 */
body{flex-direction:column;align-items:flex-start;justify-content:flex-start;
     padding:22px 24px;background:#f2f4f7}

/* 路径条是一条实心白带，不是一串飘着的字 —— 它替整页报当前位置 */
.bar{display:inline-flex;align-items:center;gap:2px;height:38px;padding:0 10px;
     border-radius:calc(var(--r) - 2px);background:#fff;
     box-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)}

.seg{display:flex;align-items:center;height:26px;padding:0 6px;border-radius:6px;
     font-size:13px;color:#667085;white-space:nowrap}
.sl{padding:0 1px;color:#c3c8d2;font-size:13px}

/* 当前项：浅蓝底 + 蓝字 + 箭头，一眼看出「岔路是从这里开的」 */
.seg.cur{background:#eaf1ff;color:#2f6bff;font-weight:500;padding-right:4px;gap:2px}
.cv{width:13px;height:13px;flex:0 0 auto;color:#2f6bff}
.last{color:#344054;font-weight:500}

/* 锚：面板的 left 跟着这一级走，路径往后排多少都不影响它 */
.drop{position:relative;display:flex}
.panel{
  position:absolute;top:calc(100% + 12px);left:0;z-index:2;
  width:var(--w);padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 28px -6px rgba(16,24,40,.16),0 2px 5px rgba(16,24,40,.06);
}
.row{display:flex;align-items:center;gap:8px;height:var(--row);padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.t{font-size:13px;font-weight:500;color:#344054;white-space:nowrap}
.row.on{background:#eaf1ff}
.row.on .t{color:#2f6bff}
.ck{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#2f6bff}

/* ── 只有路径：面板收走，路径条原地不动 ───────────────────── */
body[data-state="closed"] .panel{display:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .bar{background:#1d2939;box-shadow:0 1px 3px rgba(0,0,0,.5)}
body[data-theme="dark"] .seg{color:#98a2b3}
body[data-theme="dark"] .seg.cur{background:rgba(47,107,255,.18);color:#84a9ff}
body[data-theme="dark"] .cv{color:#84a9ff}
body[data-theme="dark"] .last{color:#f2f4f7}
body[data-theme="dark"] .panel{background:#1d2939;box-shadow:0 12px 28px -6px rgba(0,0,0,.6)}
body[data-theme="dark"] .t{color:#f2f4f7}
body[data-theme="dark"] .row.on{background:rgba(47,107,255,.18)}
body[data-theme="dark"] .row.on .t{color:#84a9ff}
body[data-theme="dark"] .ck{color:#84a9ff}
`
    },
    {
      /* 16 工作空间切换。它和下拉选择器长得像，但不是表单里的一格：它挂在
       * 页面顶上，装的是「你现在是谁」，所以每行都带一块方形头像 —— 个人、
       * 团队、研发各有各的颜色，扫一眼就分得开。当前那个额外压一个对勾。
       * 收尾是一行「新建空间」：切换之外，还得能再开一个 —— 只给已有的几个，
       * 想加一个团队就得先退回首页找入口。底下不再挂设置与退出。 */
      id: "menu-workspace",
      name: "工作空间切换菜单",
      tags: ["部件", "菜单", "工作空间切换", "场景", "工作台"],
      summary: "顶上一颗紫底方头像加「设计团队」，右侧一个小箭头；点开是一块面板：上一行灰字「切换工作空间」，下面三个空间各带彩色方头像，当前那个紫底高亮、右端一个对勾，隔一道线收在「＋ 新建空间」上。",
      note: "当前项一定要有对勾，别只靠底色：底色在暗光下和悬停态几乎一样，对勾是唯一不会看错的那个记号。空间超过一屏就别再往下堆了 —— 它是「随手换一下」，不是空间管理页，真要列全就给它一个搜索，而不是把这块面板撑成一张长表；「新建空间」永远收在最底下，因为它是收尾动作，不该被一堆已有空间挤到看不见。也别在这里塞设置、退出这类全局动作：那是账号菜单的事，混进来之后「当前是谁」这件事就模糊了。",
      ref: "img/menu-16-workspace.jpg",
      previewVw: 330,
      previewVh: 350,
      states: [
        { id: "open",   label: "展开" },
        { id: "closed", label: "收起" }
      ],
      metrics: [
        { label: "触发器", value: "44px 高" },
        { label: "面板宽", value: "268px" },
        { label: "项高",   value: "44px" },
        { label: "头像",   value: "26px · 圆角 8" },
        { label: "圆角",   value: "10px" },
        { label: "字",     value: "13.5px / 500" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 232, max: 320, step: 4, value: 268, unit: "px" },
        { name: "row", label: "项高",   min: 36,  max: 56,  step: 1, value: 44,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="trig">
  <span class="av">设</span>
  <span class="t">设计团队</span>
  <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9.5l6 5.5 6-5.5"/>
  </svg>
</div>

<div class="panel">
  <!-- 一行灰标题：说清这块面板换的是什么，不是又一个普通菜单 -->
  <div class="cap">切换工作空间</div>

  <div class="row">
    <span class="av soft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 19V6M6.2 11.8 12 6l5.8 5.8"/>
      </svg>
    </span>
    <span class="t">个人空间</span>
  </div>

  <!-- 当前：紫底高亮 + 右端对勾。对勾在，就不靠颜色单独说事 -->
  <div class="row on">
    <span class="av">设</span>
    <span class="t">设计团队</span>
    <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7"/>
    </svg>
  </div>

  <div class="row">
    <span class="av green">研</span>
    <span class="t">研发团队</span>
  </div>

  <div class="sep"></div>

  <!-- 收尾：切换之外的另一个动作，换个加号，不带头像 -->
  <div class="row new">
    <span class="plus">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true">
        <path d="M12 5.5v13M5.5 12h13"/>
      </svg>
    </span>
    <span class="t">新建空间</span>
  </div>
</div>`,
      css: `
/* 触发器钉在顶上：面板开合时它一步都不挪，那一小块位置是肌肉记忆 */
body{flex-direction:column;align-items:flex-start;justify-content:flex-start;
     padding:22px 24px;background:#f2f4f7}

/* 触发器与面板同宽：面板一展开，边界就在同一条竖线上，看着是一块东西 */
.trig{
  display:flex;align-items:center;gap:10px;width:var(--w);height:44px;padding:0 12px;
  border:1px solid #e7e9ef;border-radius:calc(var(--r) - 2px);background:#fff;
  box-shadow:0 1px 2px rgba(16,24,40,.05);
}
.trig .t{font-size:14px;font-weight:600;color:#1d2939}
.cv{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#98a2b3}

/* 方头像：三个空间三种底色。方而不是圆 —— 圆头像在这个 App 里是「人」 */
.av{flex:0 0 auto;display:grid;place-items:center;width:26px;height:26px;
    border-radius:8px;background:#eeecfe;color:#5b4fd6;
    font-size:12px;font-weight:600;line-height:1}
.av svg{width:15px;height:15px}
.av.soft{background:#f2f0fe;color:#7a6be8}
.av.green{background:#e6f6ec;color:#12805c}

.panel{
  width:var(--w);margin-top:8px;padding:6px;border-radius:var(--r);background:#fff;
  box-shadow:0 12px 28px -6px rgba(16,24,40,.16),0 2px 5px rgba(16,24,40,.06);
}
.cap{display:flex;align-items:center;height:28px;padding:0 10px;
     font-size:11.5px;color:#98a2b3;white-space:nowrap}
.row{display:flex;align-items:center;gap:10px;height:var(--row);padding:0 10px;
     border-radius:calc(var(--r) - 3px)}
.t{font-size:13.5px;font-weight:500;color:#344054;white-space:nowrap}
.row.on{background:#f0eefe}
.row.on .t{color:#5b4fd6}
.ck{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#5b4fd6}

.sep{height:1px;margin:5px 6px;background:#eaecf0}

/* 新建：不给底色也不给头像，它是动作，不是第四个空间 */
.plus{flex:0 0 auto;display:grid;place-items:center;width:26px;height:26px;color:#667085}
.plus svg{width:15px;height:15px}
.row.new .t{font-weight:400;color:#475467}

/* ── 收起：面板收走，只留顶上那条触发器 ───────────────────── */
body[data-state="closed"] .panel{display:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .trig{background:#1d2939;border-color:#344054;box-shadow:0 1px 3px rgba(0,0,0,.4)}
body[data-theme="dark"] .trig .t{color:#f2f4f7}
body[data-theme="dark"] .panel{background:#1d2939;box-shadow:0 12px 28px -6px rgba(0,0,0,.6)}
body[data-theme="dark"] .cap{color:#98a2b3}
body[data-theme="dark"] .t{color:#f2f4f7}
body[data-theme="dark"] .av{background:#2b2748;color:#b3a8ff}
body[data-theme="dark"] .av.soft{background:#2a2440;color:#b3a8ff}
body[data-theme="dark"] .av.green{background:#15352a;color:#6ce9a6}
body[data-theme="dark"] .row.on{background:#241f45}
body[data-theme="dark"] .row.on .t{color:#b3a8ff}
body[data-theme="dark"] .ck{color:#b3a8ff}
body[data-theme="dark"] .sep{background:#344054}
body[data-theme="dark"] .plus{color:#98a2b3}
body[data-theme="dark"] .row.new .t{color:#cecfd4}
`
    },
    {
      /* 17 缩略图选项菜单。名字不顶事的时候看图：三个候选平铺在一块面板里，
       * 每个是一条用细线画的版式骨架 —— 单栏是三横条、双栏是左块右条、网格是
       * 四小块。看形状比读「单栏/双栏」快，但那行名字不能省。
       * 选中那块描边变蓝、右上角压一个白底蓝勾；指向时只把描边调灰，不动内容。 */
      id: "menu-thumbnail",
      name: "缩略图选项菜单",
      tags: ["部件", "菜单", "缩略图菜单", "场景", "工作台"],
      summary: "触发器写着「页面布局 · 双栏」，点开是一块三格面板：单栏（三条横杠堆叠）、双栏（选中，蓝描边加右上角白底蓝勾）、网格（2×2 四小块），每格下面一行小字标着名字，选中的那行字跟着变蓝。",
      note: "名字不能省：三块图长得越像，名字越是唯一的分辨手段，只留图就退回成一排灰块。一行别超过三块：格子一窄，骨架就挤成几条看不清的线，那时它不如一个列表。版式之间的差别必须能用形状说清 —— 如果差别只在圆角、间距这类细节，缩略图会逼人凑近看，反而比文字慢。",
      ref: "img/menu-17-thumbnail.jpg",
      previewVw: 380,
      previewVh: 230,
      states: [
        { id: "default", label: "选中一块" },
        { id: "hover",   label: "指向一块" }
      ],
      metrics: [
        { label: "触发器", value: "40px 高" },
        { label: "缩略图", value: "96 × 66" },
        { label: "面板宽", value: "324px" },
        { label: "间隙",   value: "8px" },
        { label: "圆角",   value: "8px" },
        { label: "字",     value: "12.5px / 500" }
      ],
      params: [
        { name: "tw", label: "缩略图宽", min: 76, max: 116, step: 4, value: 96, unit: "px" },
        { name: "r",  label: "圆角",     min: 4,  max: 12,  step: 1, value: 8,  unit: "px" }
      ],
      html: `
<div class="pick">

  <div class="trig">
    <span class="t">页面布局 · 双栏</span>
    <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6 9.5l6 5.5 6-5.5"/>
    </svg>
  </div>

  <div class="panel">

    <!-- 单栏：三条横杠，从上到下排 -->
    <div class="opt">
      <span class="frame one">
        <span class="ln"></span><span class="ln"></span><span class="ln"></span>
      </span>
      <span class="lb">单栏</span>
    </div>

    <!-- 双栏：左边一条竖块当栏，右边三行。选中 —— 蓝描边 + 白底蓝勾 -->
    <div class="opt on">
      <span class="frame two">
        <span class="col"><span class="ln big"></span></span>
        <span class="col"><span class="ln"></span><span class="ln"></span><span class="ln"></span></span>
      </span>
      <span class="lb">双栏</span>
      <span class="badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7"/>
        </svg>
      </span>
    </div>

    <!-- 网格：2 × 2 四小块 -->
    <div class="opt">
      <span class="frame four">
        <span class="cell"></span><span class="cell"></span>
        <span class="cell"></span><span class="cell"></span>
      </span>
      <span class="lb">网格</span>
    </div>

  </div>
</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;padding:24px;background:#f2f4f7}

/* 触发器与面板同宽：展开时两块边对齐，像同一个控件拉开的 */
.pick{display:inline-flex;flex-direction:column;gap:8px}
.trig{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;
      border:1px solid #e4e7ec;border-radius:var(--r);background:#fff}
.trig .t{font-size:13px;font-weight:500;color:#344054;white-space:nowrap}
.cv{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#667085}

.panel{display:flex;gap:8px;padding:10px;border-radius:var(--r);background:#fff;
       box-shadow:0 12px 28px -6px rgba(16,24,40,.16),0 2px 5px rgba(16,24,40,.06)}

/* 一格 = 骨架 + 名字。名字在框外，不压在图里 —— 图是要看的 */
.opt{position:relative;display:flex;flex-direction:column;gap:6px;align-items:center}
.frame{display:flex;flex-direction:column;gap:6px;width:var(--tw);height:66px;
       padding:9px;border:1px solid #e4e7ec;border-radius:var(--r);background:#fff}

/* 骨架全是细线块：这里是线框，不是填色块，颜色只能浅到「示意」这一档 */
.ln{display:block;height:7px;border-radius:2px;background:#e4e9f2}
.frame.one{justify-content:space-between}

.frame.two{flex-direction:row;gap:6px;align-items:stretch}
.col{display:flex;flex-direction:column;gap:5px;flex:1 1 0;min-width:0}
.ln.big{flex:1 1 auto;height:auto}

.frame.four{flex-direction:row;flex-wrap:wrap;gap:5px}
.cell{flex:1 1 calc(50% - 2.5px);height:20px;border-radius:2px;background:#e4e9f2}

.lb{font-size:12.5px;font-weight:500;color:#475467;text-align:center;white-space:nowrap}

/* 选中：描边变蓝，骨架跟着上一点色 —— 底色不能靠勾一个人扛 */
.opt.on .frame{border-color:#5b6cf9;box-shadow:0 0 0 1px #5b6cf9}
.opt.on .ln,.opt.on .cell{background:#dfe2fd}
.opt.on .lb{color:#5b6cf9}

/* 勾角标压在外框右上：白底 + 蓝勾，框再深也看得见 */
.badge{position:absolute;top:-8px;right:-8px;display:grid;place-items:center;
       width:18px;height:18px;border-radius:50%;background:#fff;color:#5b6cf9;
       box-shadow:0 0 0 1.5px #5b6cf9,0 1px 2px rgba(16,24,40,.12)}
.badge svg{width:11px;height:11px}

/* ── 指向：只把描边调灰。改内容会让人以为已经选中了 ────────── */
body[data-state="hover"] .opt:nth-child(1) .frame{box-shadow:0 0 0 2px #d0d5dd}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .trig{background:#1d2939;border-color:#344054}
body[data-theme="dark"] .trig .t{color:#f2f4f7}
body[data-theme="dark"] .cv{color:#98a2b3}
body[data-theme="dark"] .panel{background:#1d2939;box-shadow:0 12px 28px -6px rgba(0,0,0,.6)}
body[data-theme="dark"] .frame{background:#141d2e;border-color:#344054}
body[data-theme="dark"] .ln,body[data-theme="dark"] .cell{background:#2c3a52}
body[data-theme="dark"] .lb{color:#cecfd4}
body[data-theme="dark"] .opt.on .frame{border-color:#7c8cfb;box-shadow:0 0 0 1px #7c8cfb}
body[data-theme="dark"] .opt.on .ln,body[data-theme="dark"] .opt.on .cell{background:#3a4270}
body[data-theme="dark"] .opt.on .lb{color:#a9b6ff}
body[data-theme="dark"] .badge{background:#1d2939;color:#a9b6ff;
                               box-shadow:0 0 0 1.5px #7c8cfb,0 1px 2px rgba(0,0,0,.4)}
body[data-theme="dark"][data-state="hover"] .opt:nth-child(1) .frame{box-shadow:0 0 0 2px #475467}
`
    },
    {
      /* 18 色板菜单。它装的不是命令也不是导航，是一组并列的值 —— 所以标题只
       * 报一句「文字颜色」，剩下全交给色块。两排各八个：上排深色管正文与标题，
       * 下排浅色管底纹与高亮。选中的那块压一个白勾，勾在深蓝上比任何边框都清楚。
       * 收尾给两条路：最近用过的那四个，和一个能精确到色值的输入框 —— 色板只
       * 给得出预设的这十六个，给不出的得有个地方去。 */
      id: "menu-color-picker",
      name: "色板选择菜单",
      tags: ["部件", "菜单", "色板菜单", "场景", "工作台"],
      summary: "一块窄面板：标题「文字颜色」，下面两排各八个 24px 的小方块，上排深色、下排浅色，选中的那块压一个白色对勾；再往下是灰色小标签「最近使用」和四个小色块，右端一个灰底等宽的色值框写着 #5B6CF9。",
      note: "两排十六个就是上限了：再多一排，眼睛就从「扫一眼」变成「逐个读」，那还不如给个输入框。色块之间必须留缝，否则邻近的两个深色会互相染色，看着像印刷糊了。对勾别想一个颜色通吃 —— 深蓝上放白勾、浅黄上放白勾等于没放，所以这一版把勾固定在深色那排的选中项上，浅色排宁可只靠描边认。最近使用不能省：它记的是这个人手上正用的四个色，比预设的十六个更常被点。",
      ref: "img/menu-18-color-picker.jpg",
      previewVw: 350,
      previewVh: 240,
      states: [
        { id: "default", label: "全部" },
        { id: "custom",  label: "输入色值" }
      ],
      metrics: [
        { label: "色块",   value: "24px · 圆角 6" },
        { label: "每排",   value: "8 个 · 间隙 10" },
        { label: "最近",   value: "18px 小色块" },
        { label: "色值框", value: "112 × 28" },
        { label: "面板宽", value: "290px" },
        { label: "字",     value: "13px / 600" }
      ],
      params: [
        { name: "sw", label: "色块尺寸", min: 20, max: 26, step: 1, value: 24, unit: "px" },
        { name: "r",  label: "色块圆角", min: 4,  max: 10, step: 1, value: 6,  unit: "px" }
      ],
      html: `
<div class="panel">
  <div class="ttl">文字颜色</div>

  <div class="rows">
    <!-- 上排：深色。正文、标题、强调都从这一排里挑 -->
    <div class="s">
      <span class="sw" style="background:#111827"></span>
      <span class="sw" style="background:#374151"></span>
      <span class="sw" style="background:#6b7280"></span>
      <span class="sw on" style="background:#5b6cf9">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7"/>
        </svg>
      </span>
      <span class="sw" style="background:#8b5cf6"></span>
      <span class="sw" style="background:#ec4899"></span>
      <span class="sw" style="background:#f97316"></span>
      <span class="sw" style="background:#ef4444"></span>
    </div>

    <!-- 下排：浅色。底纹、高亮块、标注用它们 -->
    <div class="s">
      <span class="sw pale" style="background:#ffffff"></span>
      <span class="sw pale" style="background:#f3f4f6"></span>
      <span class="sw pale" style="background:#dbeafe"></span>
      <span class="sw pale" style="background:#bfdbfe"></span>
      <span class="sw pale" style="background:#ede9fe"></span>
      <span class="sw pale" style="background:#fce7f3"></span>
      <span class="sw pale" style="background:#ffedd5"></span>
      <span class="sw pale" style="background:#fdf0c4"></span>
    </div>
  </div>

  <!-- 收口两件：刚用过的四个，和能写进任意色值的那个框 -->
  <div class="cap">最近使用</div>
  <div class="foot">
    <span class="mini" style="background:#5b6cf9"></span>
    <span class="mini" style="background:#111827"></span>
    <span class="mini" style="background:#f59e0b"></span>
    <span class="mini" style="background:#8b5cf6"></span>
    <span class="hexbox">#5B6CF9</span>
  </div>
</div>`,
      css: `
body{background:#f2f4f7}

/* 宽度交给内容：色块一放大，面板跟着长，不靠写死的数去追 */
.panel{
  width:max-content;padding:14px;border-radius:calc(var(--r) * 2);background:#fff;
  box-shadow:0 12px 28px -6px rgba(16,24,40,.16),0 2px 5px rgba(16,24,40,.06);
}
.ttl{font-size:13px;font-weight:600;color:#1d2939}

.rows{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.s{display:flex;gap:10px}
.sw{position:relative;flex:0 0 auto;width:var(--sw);height:var(--sw);
    border-radius:var(--r);box-shadow:inset 0 0 0 1px rgba(16,24,40,.08)}
/* 浅色那排必须自带一道内描边，否则白块在白色面板上就是一块空白 */
.sw.pale{box-shadow:inset 0 0 0 1px rgba(16,24,40,.12)}
.sw svg{position:absolute;top:50%;left:50%;width:13px;height:13px;
        transform:translate(-50%,-50%)}

.cap{margin-top:12px;font-size:11.5px;line-height:1.4;color:#98a2b3}
.foot{display:flex;align-items:center;gap:8px;margin-top:6px}
.mini{flex:0 0 auto;width:18px;height:18px;border-radius:calc(var(--r) - 2px);
      box-shadow:inset 0 0 0 1px rgba(16,24,40,.1)}

/* 色值框平时是一块灰底，边框先占着位置（透明），高亮时只换颜色不动布局 */
.hexbox{display:flex;align-items:center;justify-content:center;margin-left:auto;
        width:112px;height:28px;border:1px solid transparent;border-radius:8px;
        background:#f2f4f7;font:500 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
        color:#475467;letter-spacing:.04em}

/* ── 输入色值：色块排退到后面，色值框抢到前面来 ───────────── */
body[data-state="custom"] .rows{opacity:.35}
body[data-state="custom"] .hexbox{
  border-color:#5b6cf9;background:#fff;color:#5b6cf9;
  box-shadow:0 0 0 3px rgba(91,108,249,.16);
}
body[data-state="custom"] .cap{color:#667085}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#101828}
body[data-theme="dark"] .panel{background:#1d2939;box-shadow:0 12px 28px -6px rgba(0,0,0,.6)}
body[data-theme="dark"] .ttl{color:#f2f4f7}
body[data-theme="dark"] .sw{box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
body[data-theme="dark"] .sw.pale{box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
body[data-theme="dark"] .cap{color:#8e95a5}
body[data-theme="dark"] .mini{box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
body[data-theme="dark"] .hexbox{background:#242f41;color:#cecfd4}
body[data-theme="dark"][data-state="custom"] .hexbox{
  border-color:#7c8cfb;background:#1d2939;color:#a9b6ff;
  box-shadow:0 0 0 3px rgba(124,140,251,.22);
}
`
    },
    {
      /* 20 行内提及菜单。它不挂在按钮下、也不浮在正中 —— 它长在光标后面，
       * 跟着文字走。外头是一张编辑器卡片：顶上一行小灰工具条，下面是正在
       * 写的那句话，「@设计」已经收成一枚浅蓝小胶囊，面板就贴在光标下面
       * 弹出来。面板小、条目矮，因为它抢的是「正在写的那句话」的位置。 */
      id: "menu-mention",
      name: "行内提及菜单",
      tags: ["部件", "菜单", "行内提及菜单", "场景", "对话"],
      summary: "编辑器卡片里敲 @ 弹出的小面板：工具条下面一行「请 @设计 补充组件说明。」，光标后面贴着三行候选 —— 彩色圆头像加单字、名字，右侧挂身份小灰字，第一行浅蓝高亮等回车。",
      note: "必须跟着光标走：长在页面正中就叫命令面板了，那一下手要离开正在写的句子。宽度按最长的名字走，别把右侧的身份说明挤掉。列表超过七个就别再堆，八个候选要人扫两遍，那时宁可让人多打一个字。",
      ref: "img/menu-20-mention.jpg",
      previewVw: 400,
      previewVh: 300,
      states: [
        { id: "default", label: "列出成员" },
        { id: "hover",   label: "指向第二项" }
      ],
      metrics: [
        { label: "卡片宽", value: "340px" },
        { label: "工具条", value: "36px · 图标 15px" },
        { label: "胶囊",   value: "高 20px · 圆角 4" },
        { label: "项高",   value: "36px" },
        { label: "头像",   value: "22px · 圆" },
        { label: "圆角",   value: "12px" }
      ],
      params: [
        { name: "w",   label: "卡片宽", min: 300, max: 400, step: 4, value: 340, unit: "px" },
        { name: "row", label: "项高",   min: 30,  max: 44,  step: 1, value: 36,  unit: "px" },
        { name: "r",   label: "圆角",   min: 8,   max: 16,  step: 1, value: 12,  unit: "px" }
      ],
      html: `
<div class="card">

  <!-- 编辑器工具条：五个小灰图标，字样的是加粗斜体，其余内联 SVG -->
  <div class="bar">
    <span class="tb b">B</span>
    <span class="tb i">I</span>
    <svg class="tb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10"/>
    </svg>
    <svg class="tb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2"/>
      <path d="M16.2 12v1.4a2.3 2.3 0 0 0 4.6 0V12a8.8 8.8 0 1 0-3.5 7"/>
    </svg>
    <svg class="tb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 1.8"/>
    </svg>
  </div>

  <!-- 正在写的那句话：「@设计」是已敲定的提及，光标紧跟其后 -->
  <div class="line">请 <span class="at">@设计</span><span class="caret"></span> 补充组件说明。</div>

  <!-- 提及面板：贴在光标下面，一行一个成员或群组，右侧挂身份说明 -->
  <div class="panel">
    <div class="row">
      <span class="av" style="background:#e3edfb;color:#2f6fed">林</span>
      <span class="t">林设计</span>
      <span class="role">设计师</span>
    </div>
    <div class="row">
      <span class="av" style="background:#e2f5ea;color:#1f9d61">陈</span>
      <span class="t">陈设计</span>
      <span class="role">设计师</span>
    </div>
    <div class="row">
      <span class="av" style="background:#fdf0e0;color:#c77d1f">团</span>
      <span class="t">设计团队</span>
      <span class="role">群组</span>
    </div>
  </div>

</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;background:#f5f6f8}

/* 编辑器卡片：工具条、那句话、提及面板都长在这张卡里 */
.card{
  width:var(--w);border-radius:var(--r);background:#fff;
  box-shadow:0 1px 2px rgba(31,41,55,.05),0 10px 26px -8px rgba(31,41,55,.12);
}

/* 工具条：五个小灰图标，之间留缝，底下一条细线隔开正文 */
.bar{display:flex;align-items:center;gap:14px;height:36px;padding:0 14px;
     border-bottom:1px solid #eef0f3;color:#8a9099}
.tb{width:15px;height:15px;flex:0 0 auto}
.tb.b{width:auto;height:auto;font-size:13px;font-weight:700;color:#5c6470}
.tb.i{width:auto;height:auto;font-size:13px;font-style:italic;
      font-family:Georgia,serif;color:#5c6470}

/* 那句话：@设计 收成浅蓝小胶囊，光标紧跟在胶囊后面 */
.line{padding:10px 14px 4px;font-size:14px;line-height:1.7;color:#262b35}
.at{display:inline-block;padding:2px 6px;border-radius:4px;background:#eaf1fe;
    color:#2f6fed;font-size:13px;line-height:1.35;font-weight:500;vertical-align:1px}
.caret{display:inline-block;width:1.5px;height:15px;margin-left:3px;
       vertical-align:-2px;background:#2f6fed}

/* 面板：贴着那句话下面弹出来，不居中、不挂在按钮下 */
.panel{margin:8px 10px 12px;padding:5px;border-radius:10px;background:#fff;
       border:1px solid #eef0f3;
       box-shadow:0 10px 24px -8px rgba(31,41,55,.18)}
.row{display:flex;align-items:center;gap:9px;height:var(--row);padding:0 9px;
     border-radius:6px}
.av{flex:0 0 auto;display:grid;place-items:center;width:22px;height:22px;
    border-radius:50%;font-size:11px;font-weight:600}
.t{font-size:13px;font-weight:500;color:#262b35;white-space:nowrap}
.role{margin-left:auto;font-size:11.5px;color:#a0a6b0;white-space:nowrap}

/* 面板刚弹出来时落点在第一项；hover 态把落点挪到第二项，两个状态要看得出差 */
.panel .row:nth-child(1){background:#eaf1fe}
.panel .row:nth-child(1) .t{color:#2f6fed}
body[data-state="hover"] .panel .row:nth-child(1){background:none}
body[data-state="hover"] .panel .row:nth-child(1) .t{color:#262b35}
body[data-state="hover"] .panel .row:nth-child(2){background:#eaf1fe}
body[data-state="hover"] .panel .row:nth-child(2) .t{color:#2f6fed}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#14171c}
body[data-theme="dark"] .card{background:#1f242c;
  box-shadow:0 1px 2px rgba(0,0,0,.4),0 10px 26px -8px rgba(0,0,0,.5)}
body[data-theme="dark"] .bar{border-bottom-color:#2c333e;color:#7d8592}
body[data-theme="dark"] .tb.b,body[data-theme="dark"] .tb.i{color:#aeb6c2}
body[data-theme="dark"] .line{color:#e8eaf0}
body[data-theme="dark"] .at{background:#22314d;color:#7aa2f5}
body[data-theme="dark"] .caret{background:#7aa2f5}
body[data-theme="dark"] .panel{background:#232935;border-color:#2c333e;
  box-shadow:0 10px 24px -8px rgba(0,0,0,.55)}
body[data-theme="dark"] .t{color:#e8eaf0}
body[data-theme="dark"] .role{color:#7d8592}
body[data-theme="dark"] .panel .row:nth-child(1){background:#22314d}
body[data-theme="dark"] .panel .row:nth-child(1) .t{color:#7aa2f5}
body[data-theme="dark"][data-state="hover"] .panel .row:nth-child(1){background:none}
body[data-theme="dark"][data-state="hover"] .panel .row:nth-child(1) .t{color:#e8eaf0}
body[data-theme="dark"][data-state="hover"] .panel .row:nth-child(2){background:#22314d}
body[data-theme="dark"][data-state="hover"] .panel .row:nth-child(2) .t{color:#7aa2f5}
`
    },
    {
      /* 11 搜索式单选框（15 可新增选项并在这里）。
       * 选项多到一个下拉装不下时，把搜索输入放进字段本身：点开即打字，
       * 面板只负责报结果。原本图上这是两个部件（11 与 15），并成一条：
       * 筛到最后什么都没有时，那块灰字下面就是一行绿色的「创建它」。 */
      id: "select-searchable",
      name: "搜索式单选框",
      tags: ["部件", "下拉选择", "搜索式单选", "场景", "表单"],
      summary: "搜索输入长在字段里：字段显示打了一半的字和右侧放大镜，面板第一行报「3 个匹配结果」，命中的字染蓝，选中的那项浅蓝底加对勾；筛不出时换成一行「未找到匹配项」和一行浅绿底的「＋ 创建它」。",
      note: "输入框要放在字段里，不在面板顶 —— 点开就能打字，不用先在面板里找输入焦点；字段还没有输入时给一行「搜索选项」占位，别留白。选项十个以内别加搜索，等于让人多按一次。筛不出结果时别留一片空白：把「创建」摆在那个位置，空着会被当成加载失败。",
      ref: "img/select-11-searchable.jpg",
      previewVw: 360,
      previewVh: 260,
      states: [
        { id: "match",  label: "筛出结果" },
        { id: "create", label: "筛不出 · 可创建" }
      ],
      metrics: [
        { label: "字段高", value: "40px" },
        { label: "面板宽", value: "300px" },
        { label: "项高",   value: "34px" },
        { label: "圆角",   value: "10px" },
        { label: "命中字", value: "染蓝 · 13px / 500" },
        { label: "创建行", value: "浅绿底 · 绿字" }
      ],
      params: [
        { name: "h", label: "字段高", min: 34, max: 52,  step: 1, value: 40,  unit: "px" },
        { name: "w", label: "面板宽", min: 240, max: 360, step: 4, value: 300, unit: "px" },
        { name: "r", label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="field">
  <span class="v v-match">界面<span class="caret"></span></span>
  <span class="v v-create">宣传插画<span class="caret"></span></span>
  <svg class="se" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20 20"/>
  </svg>
  <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9.5l6 5.5 6-5.5"/>
  </svg>
</div>

<div class="panel">
  <!-- 结果计数：把「筛完还剩几个」说在明处 -->
  <div class="cnt">3 个匹配结果</div>

  <div class="list list-match">
    <div class="row on">
      <span class="t"><em>界面</em>组件</span>
      <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7"/>
      </svg>
    </div>
    <div class="row"><span class="t"><em>界面</em>规范</span></div>
    <div class="row"><span class="t"><em>界面</em>原型</span></div>
  </div>

  <!-- 筛不出：一块灰字交代原因，绿色一行把「创建它」递到手上 -->
  <div class="list list-create">
    <div class="none">未找到匹配项</div>
    <div class="row create">
      <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true">
        <path d="M12 5.5v13M5.5 12h13"/>
      </svg>
      <span class="t">创建「宣传插画」</span>
    </div>
  </div>

  <div class="foot">按 Enter 创建并选中</div>
</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;background:#f5f6f8}

/* 输入就在字段里：点开即打字，面板只负责列结果 */
.field{
  display:flex;align-items:center;gap:8px;width:var(--w);height:var(--h);
  padding:0 12px;border:1px solid #d4d9e0;border-radius:var(--r);background:#fff;
}
.v{display:flex;align-items:center;font-size:13.5px;color:#262b35;white-space:nowrap}
.v-create{display:none}
.caret{display:inline-block;width:1.5px;height:15px;margin-left:2px;
       vertical-align:-2px;background:#2f6fed}
.se{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#8a9099}
.cv{width:14px;height:14px;flex:0 0 auto;color:#8a9099}

.panel{
  width:var(--w);margin-top:6px;border-radius:var(--r);background:#fff;overflow:hidden;
  box-shadow:0 10px 26px -8px rgba(31,41,55,.16),0 2px 6px rgba(31,41,55,.06);
}
.cnt{padding:9px 14px 5px;font-size:11.5px;color:#a0a6b0}

.list{display:flex;flex-direction:column;padding:2px 6px 6px}
.list-create{display:none}
.row{display:flex;align-items:center;gap:8px;height:34px;padding:0 9px;border-radius:6px}
.t{font-size:13px;font-weight:500;color:#262b35;white-space:nowrap}
/* 命中的字染蓝：让人看见「为什么它被留下来」 */
.t em{font-style:normal;color:#2f6fed}
.ck{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#2f6fed}
.row.on{background:#eaf1fe}
.row.on .t,.row.on .t em{color:#2f6fed}

/* 创建行不是第五个选项，是一个动作：浅绿底、绿字、加号开头 */
.row.create{background:#e9f7ef}
.row.create .ic{width:14px;height:14px;flex:0 0 auto;color:#1f9d61}
.row.create .t{color:#1f9d61}
.none{padding:8px 9px 6px;font-size:12px;color:#a0a6b0}

.foot{display:none;padding:8px 14px;border-top:1px solid #eef0f3;
      font-size:11px;color:#a0a6b0}

/* ── 筛不出：字段里的字换掉，面板整列换成「创建它」，底部提示跟上 ── */
body[data-state="create"] .v-match{display:none}
body[data-state="create"] .v-create{display:flex}
body[data-state="create"] .list-match{display:none}
body[data-state="create"] .list-create{display:flex}
body[data-state="create"] .foot{display:block}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#14171c}
body[data-theme="dark"] .field{background:#1f242c;border-color:#38404d}
body[data-theme="dark"] .v{color:#e8eaf0}
body[data-theme="dark"] .caret{background:#7aa2f5}
body[data-theme="dark"] .se,body[data-theme="dark"] .cv{color:#7d8592}
body[data-theme="dark"] .panel{background:#1f242c;
  box-shadow:0 10px 26px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4)}
body[data-theme="dark"] .cnt,body[data-theme="dark"] .none,
body[data-theme="dark"] .foot{color:#7d8592}
body[data-theme="dark"] .foot{border-top-color:#2c333e}
body[data-theme="dark"] .t{color:#e8eaf0}
body[data-theme="dark"] .t em{color:#7aa2f5}
body[data-theme="dark"] .row.on{background:#22314d}
body[data-theme="dark"] .row.on .t,body[data-theme="dark"] .row.on .t em{color:#7aa2f5}
body[data-theme="dark"] .ck{color:#7aa2f5}
body[data-theme="dark"] .row.create{background:#1d3a2c}
body[data-theme="dark"] .row.create .t,body[data-theme="dark"] .row.create .ic{color:#4ec98a}
`
    },
    {
      /* 12 多选标签下拉框。选中的每一项从面板里搬出来，变成字段里的一枚
       * 标签 —— 人能看见自己选了什么，不用再点开确认。面板还开着：复选框
       * 一行一个，勾选与字段里的标签实时对应，底栏一行小灰字报着总数。 */
      id: "select-multi",
      name: "多选标签下拉框",
      tags: ["部件", "下拉选择", "多选标签", "场景", "表单"],
      summary: "字段里躺着两枚浅蓝标签「设计 ×」「研发 ×」，每枚后面一个叉可以单独移除，右侧一个 chevron；下面面板一行一个复选框，勾过的与标签对应，底栏一条上边框隔开的小灰字「已选择 2 项」。",
      note: "标签堆到三枚以上就开始换行，字段会长高一截 —— 要么让它长，要么收成「已选 4 项」，别硬挤成一行把字截断。每枚标签都要有那个叉：取消一个不该先点开面板再在里面找。底栏的计数别省：勾选散在一列里，总数看一眼才知道选了几个。",
      ref: "img/select-12-multi.jpg",
      previewVw: 360,
      previewVh: 290,
      states: [
        { id: "open",   label: "面板展开" },
        { id: "closed", label: "收起" }
      ],
      metrics: [
        { label: "字段高", value: "44px" },
        { label: "标签",   value: "高 24px · 圆角 6" },
        { label: "复选框", value: "16px · 圆角 4" },
        { label: "项高",   value: "34px" },
        { label: "底栏",   value: "30px · 上边框" },
        { label: "圆角",   value: "10px" }
      ],
      params: [
        { name: "h", label: "字段高", min: 36, max: 52,  step: 1, value: 44,  unit: "px" },
        { name: "w", label: "面板宽", min: 240, max: 360, step: 4, value: 300, unit: "px" },
        { name: "r", label: "圆角",   min: 6,  max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="field">
  <div class="tags">
    <span class="tag">设计
      <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17"/>
      </svg>
    </span>
    <span class="tag">研发
      <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17"/>
      </svg>
    </span>
  </div>
  <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 14.5l6-5.5 6 5.5"/>
  </svg>
</div>

<div class="panel">
  <div class="row">
    <span class="cb on">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7"/>
      </svg>
    </span>
    <span class="t">设计</span>
  </div>
  <div class="row">
    <span class="cb on">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7"/>
      </svg>
    </span>
    <span class="t">研发</span>
  </div>
  <div class="row"><span class="cb"></span><span class="t">运营</span></div>
  <div class="row"><span class="cb"></span><span class="t">市场</span></div>
  <div class="foot">已选择 2 项</div>
</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;background:#f5f6f8}

.field{
  display:flex;align-items:center;gap:8px;width:var(--w);min-height:var(--h);
  padding:6px 12px;border:1px solid #d4d9e0;border-radius:var(--r);background:#fff;
}
.tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1 1 auto}

/* 标签：浅蓝底蓝字，后面的叉负责单独移除这一枚 */
.tag{display:flex;align-items:center;gap:5px;height:24px;padding:0 7px;
     border-radius:6px;background:#eaf1fe;color:#2f6fed;
     font-size:12.5px;font-weight:500;white-space:nowrap}
.x{width:11px;height:11px;flex:0 0 auto;opacity:.75}

.cv{width:15px;height:15px;flex:0 0 auto;color:#8a9099}

.panel{
  width:var(--w);margin-top:6px;padding:5px 6px 0;border-radius:var(--r);
  background:#fff;overflow:hidden;
  box-shadow:0 10px 26px -8px rgba(31,41,55,.16),0 2px 6px rgba(31,41,55,.06);
}
.row{display:flex;align-items:center;gap:9px;height:34px;padding:0 8px;
     border-radius:6px}
.t{font-size:13px;font-weight:500;color:#262b35;white-space:nowrap}

/* 复选框：勾过的蓝底白勾，没勾的白底灰框 */
.cb{position:relative;flex:0 0 auto;width:16px;height:16px;
    border:1.5px solid #c9cfd8;border-radius:4px;background:#fff}
.cb.on{border-color:#2f6fed;background:#2f6fed}
.cb.on svg{position:absolute;top:2px;left:2px;width:10px;height:10px}

/* 底栏：一条上边框隔开，总数报在明处 */
.foot{margin:3px -6px 0;padding:7px 14px 8px;border-top:1px solid #eef0f3;
      font-size:11.5px;color:#a0a6b0}

/* ── 收起：面板收走，chevron 翻回朝下 ─────────────────────── */
body[data-state="closed"] .panel{display:none}
body[data-state="closed"] .cv{transform:rotate(180deg)}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#14171c}
body[data-theme="dark"] .field{background:#1f242c;border-color:#38404d}
body[data-theme="dark"] .tag{background:#22314d;color:#7aa2f5}
body[data-theme="dark"] .cv{color:#7d8592}
body[data-theme="dark"] .panel{background:#1f242c;
  box-shadow:0 10px 26px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4)}
body[data-theme="dark"] .t{color:#e8eaf0}
body[data-theme="dark"] .cb{border-color:#4a5260;background:#1f242c}
body[data-theme="dark"] .cb.on{border-color:#5b8ff0;background:#5b8ff0}
body[data-theme="dark"] .cb.on svg{stroke:#14171c}
body[data-theme="dark"] .foot{border-top-color:#2c333e;color:#7d8592}
`
    },
    {
      /* 13 分组下拉选择器。选项一多就自己长出层级：组标题不参与选择，它只是
       * 一条分界 —— 有了它，二十个选项还是能一眼扫完，因为它把二十行切成
       * 几段，每段都短。字段在顶上收口，面板挂在它下面。 */
      id: "select-grouped",
      name: "分组下拉选择器",
      tags: ["部件", "下拉选择", "分组选择", "场景", "表单"],
      summary: "字段「选择工具」下面挂一块面板：组标题「设计」「开发」各领一列小灰字，标题下面几项，选中的「画布工具」浅蓝底、蓝字、右侧一个对勾，标题本身不参与选择。",
      note: "标题不能点：它是一条分界，点它会被当成选了一个没有结果的选项。组数别超过五段，五段以上就得分栏，那时它更像巨型菜单。组内项数要接近 —— 一组两项一组九项，扫的时候会以为九项那组是全部。",
      ref: "img/select-13-grouped.jpg",
      previewVw: 340,
      previewVh: 320,
      states: [
        { id: "default", label: "展开" },
        { id: "hover",   label: "指向一项" }
      ],
      metrics: [
        { label: "字段高", value: "40px" },
        { label: "面板宽", value: "280px" },
        { label: "项高",   value: "36px" },
        { label: "标题行", value: "22px · 小灰字" },
        { label: "圆角",   value: "10px" },
        { label: "字",     value: "13px / 500" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 220, max: 340, step: 4, value: 280, unit: "px" },
        { name: "row", label: "项高",   min: 30,  max: 44,  step: 1, value: 36,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="field">
  <span class="v">选择工具</span>
  <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9.5l6 5.5 6-5.5"/>
  </svg>
</div>

<div class="panel">

  <div class="grp">
    <div class="gh">设计</div>
    <div class="row on">
      <span class="t">画布工具</span>
      <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7"/>
      </svg>
    </div>
    <div class="row"><span class="t">原型工具</span></div>
  </div>

  <div class="grp">
    <div class="gh">开发</div>
    <div class="row"><span class="t">代码编辑器</span></div>
    <div class="row"><span class="t">终端工具</span></div>
  </div>

</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;background:#f5f6f8}

.field{
  display:flex;align-items:center;gap:8px;width:var(--w);height:40px;padding:0 12px;
  border:1px solid #d4d9e0;border-radius:var(--r);background:#fff;
}
.v{font-size:13.5px;font-weight:500;color:#262b35;white-space:nowrap}
.cv{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#8a9099}

.panel{
  width:var(--w);margin-top:6px;padding:5px 6px 6px;border-radius:var(--r);
  background:#fff;
  box-shadow:0 10px 26px -8px rgba(31,41,55,.16),0 2px 6px rgba(31,41,55,.06);
}
.grp + .grp{margin-top:4px}
/* 标题是分界，不是选项：字小、色浅、不参与命中 */
.gh{padding:5px 10px 3px;font-size:11.5px;font-weight:500;color:#a0a6b0}

.row{display:flex;align-items:center;height:var(--row);padding:0 10px;
     border-radius:6px}
.t{font-size:13px;font-weight:500;color:#262b35;white-space:nowrap}
.ck{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#2f6fed}
.row.on{background:#eaf1fe}
.row.on .t{color:#2f6fed}

/* ── 指向：铺一层底，选中的那项也照铺 —— 它仍然能被指向 ──── */
body[data-state="hover"] .grp:nth-child(2) .row:nth-child(1){background:#eef0f3}
body[data-state="hover"] .grp:nth-child(2) .row:nth-child(1) .t{color:#262b35}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#14171c}
body[data-theme="dark"] .field{background:#1f242c;border-color:#38404d}
body[data-theme="dark"] .v{color:#e8eaf0}
body[data-theme="dark"] .cv{color:#7d8592}
body[data-theme="dark"] .panel{background:#1f242c;
  box-shadow:0 10px 26px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4)}
body[data-theme="dark"] .gh{color:#7d8592}
body[data-theme="dark"] .t{color:#e8eaf0}
body[data-theme="dark"] .row.on{background:#22314d}
body[data-theme="dark"] .row.on .t{color:#7aa2f5}
body[data-theme="dark"] .ck{color:#7aa2f5}
body[data-theme="dark"][data-state="hover"] .grp:nth-child(2) .row:nth-child(1){background:#2c333e}
body[data-theme="dark"][data-state="hover"] .grp:nth-child(2) .row:nth-child(1) .t{color:#e8eaf0}
`
    },
    {
      /* 14 树形下拉选择器。它比分组更进一步：层级不止两层，且每层都能自己
       * 被选 —— 所以父级要有第三个状态。半选那道白横杠就是它：下面选了
       * 一部分，上面既不是选中也不是没选。字段在顶上收口，复选框在名字
       * 前面，箭头只管展开折叠。 */
      id: "select-tree",
      name: "树形下拉选择器",
      tags: ["部件", "下拉选择", "树形选择", "场景", "表单"],
      summary: "字段「选择目录」下面挂一棵树：父级「设计资源」展开，复选框半选 —— 蓝底中间一道白横杠；缩进的子项品牌、界面、菜单里只有界面被勾、整行浅蓝高亮；兄弟行「工程」箭头朝右还折着。",
      note: "半选必须单独画：父级的勾与子级的勾混在一起，用户看不出还有哪些没选。层级超过三层就别再缩进，改成分栏或者只留一条路径 —— 缩进到第四层，右边只剩一行字的宽度。可展开的箭头与可选择的框是两个命中区，别让点箭头也算选中。",
      ref: "img/select-14-tree.jpg",
      previewVw: 360,
      previewVh: 280,
      states: [
        { id: "open", label: "展开一层" },
        { id: "flat", label: "全部折叠" }
      ],
      metrics: [
        { label: "字段高", value: "40px" },
        { label: "面板宽", value: "300px" },
        { label: "行高",   value: "36px / 子行 32px" },
        { label: "复选框", value: "16px · 圆角 4" },
        { label: "半选",   value: "蓝底 · 白横杠" },
        { label: "缩进",   value: "20px" }
      ],
      params: [
        { name: "w",   label: "面板宽", min: 240, max: 380, step: 4, value: 300, unit: "px" },
        { name: "row", label: "行高",   min: 32,  max: 46,  step: 1, value: 36,  unit: "px" },
        { name: "r",   label: "圆角",   min: 6,   max: 16,  step: 1, value: 10,  unit: "px" }
      ],
      html: `
<div class="field">
  <span class="v">选择目录</span>
  <svg class="cv" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 14.5l6-5.5 6 5.5"/>
  </svg>
</div>

<div class="panel">

  <!-- 父级：下面只选了一部分，半选那道白横杠就是它 -->
  <div class="row">
    <svg class="ar open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6"/>
    </svg>
    <span class="cb half"><span class="dash"></span></span>
    <span class="t">设计资源</span>
  </div>

  <div class="kids">
    <div class="row"><span class="pad"></span><span class="cb"></span><span class="t">品牌</span></div>
    <div class="row on">
      <span class="pad"></span>
      <span class="cb on">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7"/>
        </svg>
      </span>
      <span class="t">界面</span>
    </div>
    <div class="row"><span class="pad"></span><span class="cb"></span><span class="t">菜单</span></div>
  </div>

  <!-- 兄弟行：箭头朝右还折着，框是空的 -->
  <div class="row">
    <svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6"/>
    </svg>
    <span class="cb"></span>
    <span class="t">工程</span>
  </div>

</div>`,
      css: `
body{flex-direction:column;align-items:flex-start;background:#f5f6f8}

.field{
  display:flex;align-items:center;gap:8px;width:var(--w);height:40px;padding:0 12px;
  border:1px solid #d4d9e0;border-radius:var(--r);background:#fff;
}
.v{font-size:13.5px;font-weight:500;color:#262b35;white-space:nowrap}
.cv{width:15px;height:15px;margin-left:auto;flex:0 0 auto;color:#8a9099}

.panel{
  width:var(--w);margin-top:6px;padding:5px 6px 6px;border-radius:var(--r);
  background:#fff;
  box-shadow:0 10px 26px -8px rgba(31,41,55,.16),0 2px 6px rgba(31,41,55,.06);
}
.row{display:flex;align-items:center;gap:8px;height:var(--row);padding:0 8px;
     border-radius:6px}
.ar{width:14px;height:14px;flex:0 0 auto;color:#8a9099}
.ar.open{transform:rotate(90deg)}
.t{font-size:13px;font-weight:500;color:#262b35;white-space:nowrap}

/* 复选框分三态：空 / 勾 / 半选。半选是蓝底中间一道白横杠 —— 下面选了一部分 */
.cb{position:relative;flex:0 0 auto;width:16px;height:16px;
    border:1.5px solid #c9cfd8;border-radius:4px;background:#fff}
.cb.on{border-color:#2f6fed;background:#2f6fed}
.cb.on svg{position:absolute;top:2px;left:2px;width:10px;height:10px}
.cb.half{border-color:#2f6fed;background:#2f6fed}
.dash{position:absolute;top:50%;left:3px;right:3px;height:2px;margin-top:-1px;
      border-radius:1px;background:#fff}

.row.on{background:#eaf1fe}
.row.on .t{color:#2f6fed}

.kids{display:flex;flex-direction:column;margin-left:20px}
.pad{width:14px;flex:0 0 auto}
.kids .row{height:32px}

/* ── 全部折叠：子项收走，箭头翻回去，父级的半选就成了唯一的线索 ── */
body[data-state="flat"] .kids{display:none}
body[data-state="flat"] .ar.open{transform:none}

/* ── 暗色 ──────────────────────────────────────────────────── */
body[data-theme="dark"]{background:#14171c}
body[data-theme="dark"] .field{background:#1f242c;border-color:#38404d}
body[data-theme="dark"] .v{color:#e8eaf0}
body[data-theme="dark"] .cv{color:#7d8592}
body[data-theme="dark"] .panel{background:#1f242c;
  box-shadow:0 10px 26px -8px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4)}
body[data-theme="dark"] .ar{color:#7d8592}
body[data-theme="dark"] .t{color:#e8eaf0}
body[data-theme="dark"] .cb{border-color:#4a5260;background:#1f242c}
body[data-theme="dark"] .cb.on{border-color:#5b8ff0;background:#5b8ff0}
body[data-theme="dark"] .cb.on svg{stroke:#14171c}
body[data-theme="dark"] .cb.half{border-color:#5b8ff0;background:#5b8ff0}
body[data-theme="dark"] .dash{background:#14171c}
body[data-theme="dark"] .row.on{background:#22314d}
body[data-theme="dark"] .row.on .t{color:#7aa2f5}
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
