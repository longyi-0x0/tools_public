/* data.js —— 布局图册的全部内容。
 *
 * 页面不认识任何一个布局，只把这里的数据画出来：加一条就是往 items 里加一个对象，
 * 删一条就是从数组里拿掉一个对象。页面本身不用改。
 *
 * BASE 是预览里那层基础样式。预览装在一个没有脚本权限的 iframe 里，本文件的字体与
 * 变量漏不进去，反过来也一样 —— 所以预览那份基础样式只能在这里，每次拼进 iframe
 * 的文档头，不能靠页面继承。
 *
 * 字段口径在文件末尾，也在本目录 README.md 里。
 */

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  font:400 13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#8b8172;background:#fff;
}
.box{padding:10px 12px;border-radius:8px;background:#f4f0e8;border:1px solid #e5dfd2;
     font-size:12px;color:#93897a;text-align:center}
.tall{min-height:120px}
.fillery{background:repeating-linear-gradient(45deg,#f4f0e8 0 8px,#faf7f1 8px 16px)}
`;

const CATALOG = {
  version: 1,
  groups: [
    { id: "shell", name: "整页骨架" },
    { id: "grid",  name: "重复与分栏" },
    { id: "flow",  name: "排布与对齐" },
    { id: "piece", name: "局部部件" }
  ],
  items: [
    {
      id: "clinic-scheduler",
      name: "诊所排程台",
      group: "shell",
      tags: ["日程", "排程", "侧栏", "详情抽屉"],
      summary: "左侧工作台导航、四列医师时间轴、右侧预约详情卡；一屏交代今天谁在班、几点做什么、这一单怎么结。",
      note: "整屏应用外壳，适合排程、工单、资源调度这类「以时间轴为主」的后台；纯列表页套这套三栏，右栏会白占掉主区宽度。每块的位置都按小时算（top: calc(var(--hour) * N)），拖 --hour 整条时间轴等比缩放，块与刻度不会脱节。",
      previewVw: 1440,
      params: [
        { name: "radius",  label: "外壳圆角", min: 0,   max: 32,  step: 2, value: 22,  unit: "px" },
        { name: "sidebar", label: "侧栏宽",   min: 200, max: 320, step: 4, value: 272, unit: "px" },
        { name: "panel",   label: "详情栏宽", min: 300, max: 470, step: 4, value: 396, unit: "px" },
        { name: "hour",    label: "每小时高", min: 56,  max: 108, step: 2, value: 80,  unit: "px" }
      ],
      html: `
<div class="app">
  <aside class="side">
    <div class="brand"><span class="mark"></span><b>medspa</b></div>

    <div class="clinic">
      <span class="clav">L</span>
      <span class="cltx"><b>Lumière Aesthetics</b><i>Soho, New York</i></span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
    </div>

    <p class="eyebrow">Workspace</p>
    <nav class="nav">
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>Overview</a>
      <a class="on" href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="9" cy="14.5" r="1" fill="currentColor" stroke="none"/></svg>Calendar<span class="ct">19</span></a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4"/><path d="M16 5.2a3 3 0 010 5.6M17.5 20c0-2.4-.7-4-2-5"/></svg>Clients</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18h4.1c2 0 3-1.2 3-2.8 0-2-1.8-2.4-3.6-3-1.8-.6-2.6-1.4-2.6-2.8C9.3 7.6 10.6 6 13 6h2.6"/></svg>Journeys<span class="ct">8</span></a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3.5c3 4.3 5.5 6.9 5.5 10a5.5 5.5 0 01-11 0c0-3.1 2.5-5.7 5.5-10z"/><path d="M9.5 14h5"/></svg>Treatment plans</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="9.5" r="5.5"/><path d="M8.5 14L7 21l5-2.5L17 21l-1.5-7"/></svg>Memberships</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 10v4a1 1 0 001 1h2l7 4V5L7 9H5a1 1 0 00-1 1z"/><path d="M18 8.5a4 4 0 010 7"/></svg>Marketing</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18"/></svg>Payments</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M8 15.5v-3M12 15.5v-6M16 15.5v-4.5"/></svg>Reports</a>
    </nav>

    <div class="assist">
      <div class="ah"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>Flow Assist</div>
      <p>8 clients are due to rebook this week. Draft reminders?</p>
      <button>Review list</button>
    </div>

    <nav class="nav nav2">
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 005 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 13.7H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 5L4.5 5a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010.3 1H10a2 2 0 114 0"/></svg>Settings</a>
      <a href="#"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.7-2.5 2-2.5 3.6"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></svg>Help &amp; support</a>
    </nav>

    <div class="me">
      <span class="meav">N</span>
      <span class="metx"><b>Nizam</b><i>Owner · Medical Director</i></span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 16l4-4-4-4M14 12H3"/></svg>
    </div>
  </aside>

  <main class="main">
    <header class="top">
      <div>
        <h1>Calendar</h1>
        <p>Thursday, 18 September · Soho clinic · <b>4 providers on shift</b></p>
      </div>
      <div class="topr">
        <div class="search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
          Search clients, treatments…
          <span class="kbd">⌘K</span>
        </div>
        <button class="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/></svg></button>
        <button class="ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z"/><path d="M10.5 20a2 2 0 003 0"/></svg></button>
        <button class="primary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New booking
        </button>
      </div>
    </header>

    <div class="bar">
      <button class="rnd"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button class="dateb">Thu, 18 September 2026</button>
      <button class="rnd"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg></button>
      <button class="today">Today</button>
      <div class="barr">
        <button class="sel">4 providers<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="sel">All rooms<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="sel">Filters<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg></button>
        <div class="seg"><b>Day</b><span>Week</span><span>Month</span><span>Rooms</span></div>
      </div>
    </div>

    <div class="board">
      <section class="cal">
        <div class="phead">
          <div></div>
          <div class="ph"><span class="pav pa1">MC</span><span class="pi"><b>Dr. Maya Chen</b><i>4 appts · 88%</i><span class="pbar"><s style="width:88%"></s></span></span></div>
          <div class="ph"><span class="pav pa2">LP</span><span class="pi"><b>Leo Park, RN</b><i>5 appts · 78%</i><span class="pbar"><s style="width:78%"></s></span></span></div>
          <div class="ph"><span class="pav pa3">JO</span><span class="pi"><b>Dr. James Ortiz</b><i>4 appts · 54%</i><span class="pbar"><s style="width:54%"></s></span></span></div>
          <div class="ph"><span class="pav pa4">NA</span><span class="pi"><b>Nina Alvarez</b><i>4 appts · 72%</i><span class="pbar"><s style="width:72%"></s></span></span></div>
        </div>

        <div class="grid">
          <div class="times">
            <span class="tm first" style="top:calc(var(--hour)*0)">9:00</span>
            <span class="tm" style="top:calc(var(--hour)*1)">10:00</span>
            <span class="tm" style="top:calc(var(--hour)*2)">11:00</span>
            <span class="tm" style="top:calc(var(--hour)*3)">12:00</span>
            <span class="tm" style="top:calc(var(--hour)*4)">13:00</span>
            <span class="tm" style="top:calc(var(--hour)*5)">14:00</span>
            <span class="tm" style="top:calc(var(--hour)*6)">15:00</span>
            <span class="tm" style="top:calc(var(--hour)*7)">16:00</span>
          </div>

          <div class="col">
            <div class="ev" style="top:calc(var(--hour)*0);height:calc(var(--hour)*.75)">
              <div class="t">9:00-9:45</div><div class="n">Consultation</div>
            </div>
            <div class="ev p" style="top:calc(var(--hour)*1);height:calc(var(--hour)*.75)">
              <div class="t">10:00-10:45</div><div class="n">Botox · 3 areas</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*2.25);height:calc(var(--hour)*.75)">
              <svg class="bd" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4"/><circle cx="12" cy="17" r=".8" fill="currentColor"/><path d="M10.3 3.8L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.8a2 2 0 00-3.4 0z"/></svg>
              <div class="t">11:15-12:00</div><div class="n">Lip filler · 1 ml</div>
            </div>
            <div class="ev plain" style="top:calc(var(--hour)*3);height:calc(var(--hour)*1)">
              <div class="n">Lunch&nbsp; 12:00-13:00</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*4.5);height:calc(var(--hour)*1)">
              <div class="t">13:30-14:30</div><div class="n">Cheek filler · 2 ml</div><div class="c">Lauren Mills</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*6);height:calc(var(--hour)*.5)">
              <div class="t">15:00-15:30</div><div class="n">Consultation</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*7);height:calc(var(--hour)*.75)">
              <div class="t">16:00-16:45</div><div class="n">Consultation</div>
            </div>
          </div>

          <div class="col">
            <div class="ev g" style="top:calc(var(--hour)*.5);height:calc(var(--hour)*.75)">
              <div class="t">9:30-10:15</div><div class="n">Dermaplaning</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*1.5);height:calc(var(--hour)*.75)">
              <div class="t">10:30-11:15</div><div class="n">HydraFacial Deluxe</div><div class="c">Chloe Bennett</div>
            </div>
            <div class="ev plain" style="top:calc(var(--hour)*3);height:calc(var(--hour)*.5)">
              <div class="n">Lunch&nbsp; 12:00-12:30</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*4.75);height:calc(var(--hour)*.66)">
              <div class="t">13:45-14:25</div><div class="n">Chemical peel</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*5.5);height:calc(var(--hour)*.66)">
              <div class="t">14:30-15:10</div><div class="n">Gold member facial</div><div class="c">Ruby Clarke</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*6.25);height:calc(var(--hour)*.66)">
              <div class="t">15:15-15:55</div><div class="n">Microneedling + PRP</div><div class="c">Isla Turner</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*7);height:calc(var(--hour)*.75)">
              <div class="t">16:00-16:45</div><div class="n">IPL photofacial</div>
            </div>
          </div>

          <div class="col">
            <div class="ev" style="top:calc(var(--hour)*0);height:calc(var(--hour)*1)">
              <div class="t">9:00-10:00</div><div class="n">Laser hair removal</div><div class="c">Daniel Reyes</div>
            </div>
            <div class="ev plain" style="top:calc(var(--hour)*3);height:calc(var(--hour)*.5)">
              <div class="n">12:00-12:30</div>
            </div>
            <div class="ev plain" style="top:calc(var(--hour)*4);height:calc(var(--hour)*1)">
              <div class="n">Lunch&nbsp; 13:00-14:00</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*5);height:calc(var(--hour)*1.5)">
              <div class="t">14:00-15:30</div><div class="n">CoolSculpting · abdom…</div><div class="c">Maria Lopez</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*6.75);height:calc(var(--hour)*.75)">
              <div class="t">15:45-16:30</div><div class="n">IPL photofacial</div>
            </div>
          </div>

          <div class="col">
            <div class="ev g" style="top:calc(var(--hour)*1);height:calc(var(--hour)*1)">
              <div class="t">10:00-11:00</div><div class="n">Microneedling</div><div class="c">Ava Johnson</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*2.5);height:calc(var(--hour)*.75)">
              <svg class="bd" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/></svg>
              <div class="t">11:30-12:15</div><div class="n">LED therapy</div>
            </div>
            <div class="ev plain" style="top:calc(var(--hour)*3.25);height:calc(var(--hour)*.75)">
              <div class="n">Lunch&nbsp; 12:15-13:00</div>
            </div>
            <div class="ev" style="top:calc(var(--hour)*4.5);height:calc(var(--hour)*1.5)">
              <svg class="bd" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/></svg>
              <div class="t">13:30-15:00</div><div class="n">Body contouring</div><div class="c">Nora Patel</div>
            </div>
            <div class="ev g" style="top:calc(var(--hour)*6.5);height:calc(var(--hour)*1)">
              <div class="t">15:30-16:30</div><div class="n">HydraFacial</div><div class="c">Lily Chen</div>
            </div>
          </div>

          <div class="now" style="top:calc(var(--hour)*1.66)"><b>10:40</b></div>
        </div>
      </section>

      <aside class="panel">
        <div class="pan-h">
          <b>Appointment</b>
          <span class="state">In treatment</span>
          <span class="sp">
            <button class="mini"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg></button>
            <button class="mini"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </span>
        </div>

        <div class="pan-b">
          <div class="client">
            <div class="cltop">
              <span class="cav">EW</span>
              <span><b>Emma Wilson</b><i>8th visit · last 12 Aug</i></span>
              <span class="cbtns">
                <button class="cbtn"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2.2 2A16.5 16.5 0 014 5.2 2 2 0 016 3z"/></svg></button>
                <button class="cbtn"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/></svg></button>
              </span>
            </div>
            <div class="chips"><span class="chip d">Gold member</span><span class="chip l">No allergies</span></div>
          </div>

          <div class="rows">
            <div class="row">
              <span class="ri"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3.5c3 4.3 5.5 6.9 5.5 10a5.5 5.5 0 01-11 0c0-3.1 2.5-5.7 5.5-10z"/></svg></span>
              <span><span class="rk">Treatment</span><span class="rv">Botox · forehead, glabella, crow's feet<br><em>Botox · 3 areas</em></span></span>
            </div>
            <div class="row">
              <span class="ri"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></span>
              <span><span class="rk">Time</span><span class="rv">10:00–10:45 <em>· 45 min</em></span></span>
            </div>
            <div class="row">
              <span class="ri"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/></svg></span>
              <span><span class="rk">Provider</span><span class="rv">Dr. Maya Chen, NP</span></span>
            </div>
            <div class="row">
              <span class="ri"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1z"/></svg></span>
              <span><span class="rk">Room</span><span class="rv">Room 2 <em>· Injectables suite</em></span></span>
            </div>
          </div>

          <div class="cut">
            <div class="cuth"><b>Pre-treatment checklist</b><span class="cnt">3 / 4</span></div>
            <div class="ck"><span class="cc"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M4 12.5l5 5L20 6"/></svg></span><span><b>Consent signed</b><i>12 Sep · Botox consent v3.1</i></span></div>
            <div class="ck"><span class="cc"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M4 12.5l5 5L20 6"/></svg></span><span><b>Baseline photos</b><i>4 angles captured</i></span></div>
            <div class="ck"><span class="cc"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M4 12.5l5 5L20 6"/></svg></span><span><b>Medical history reviewed</b><i>No changes since June</i></span></div>
            <div class="ck off"><span class="cc"></span><span><b>Units &amp; lot number</b><i>in progress · 38 of 40 units</i></span></div>
          </div>

          <div class="bill">
            <div class="bl"><span>Botox · 40 units</span><span>$600</span></div>
            <div class="bl"><span>Plan saving (10%)</span><span>−$60</span></div>
            <div class="bl"><span>Gold Botox credit</span><span>−$60</span></div>
            <div class="bl due"><span>Due at checkout</span><span>$480</span></div>
            <div class="pay">
              <span class="vi">VISA</span><span>•••• 4242 on file</span>
              <button class="co">Checkout
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <div class="toast">
    <span class="tk"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4 12.5l5 5L20 6"/></svg></span>
    <span class="tt"><b>Appointment booked</b><i>Sofia Laurent · Thu 2 Oct, 11:00 · Dr. Ortiz · SMS sent</i></span>
    <span class="ta"><button class="tb">View</button><button class="tb">Undo</button></span>
  </div>
</div>
      `,
      css: `
:root{
  
  --ink:#17171a;--ink2:#3b3b40;--muted:#8d8d92;--dim:#a6a39b;
  --line:#ece9e1;--line2:#f4f1ea;--cream:#f8f6f0;--cream2:#fbf9f3;
  --lime:#e6f2a8;--lav:#e7e1fa;--purple:#7c53f4;
  --green:#e5f1dd;--greenln:#d4e6c7;--red:#df4339;
}
*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;padding:16px;background:#e8e7ed;color:#17171a;
  font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
svg{display:block;flex:none}
.app{
  position:relative;display:flex;height:calc(100vh - 32px);min-height:640px;
  background:#f8f6f0;border-radius:var(--radius);overflow:hidden;
  box-shadow:0 18px 44px rgba(24,20,40,.10),0 1px 0 rgba(255,255,255,.7) inset;
}

/* ---------------- 侧栏 ---------------- */
.side{
  width:var(--sidebar);flex:none;display:flex;flex-direction:column;
  background:#fbf9f3;border-right:1px solid #ece9e1;padding:16px 13px 12px;
}
.brand{display:flex;align-items:center;gap:8px;padding:0 5px 12px}
.mark{width:23px;height:23px;border-radius:8px;background:conic-gradient(from 210deg,#c9e06a,#8f7bea,#f0c8b6,#c9e06a);position:relative}
.mark::after{content:"";position:absolute;inset:6px;border-radius:50%;background:#fbf9f3}
.brand b{font-size:14.5px;font-weight:600;letter-spacing:-.3px}

.clinic{
  display:flex;align-items:center;gap:8px;padding:7px 8px;background:#fff;
  border:1px solid #ece9e1;border-radius:10px;margin-bottom:14px;
}
.clav{width:26px;height:26px;border-radius:7px;background:#e7e1fa;color:#5b4b8f;
  font-size:10px;font-weight:600;display:grid;place-items:center;flex:none}
.cltx{min-width:0;flex:1}
.cltx b{display:block;font-size:11px;font-weight:600;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cltx i{display:block;font-size:9px;font-style:normal;color:#a6a39b;margin-top:1px}
.clinic svg{color:#b3b0a8}

.eyebrow{font-size:8.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  color:#b6b3aa;padding:0 7px;margin:0 0 5px}

.nav{display:flex;flex-direction:column;gap:1px}
.nav a{display:flex;align-items:center;gap:9px;padding:6.5px 8px;border-radius:8px;
  font-size:11.5px;color:#43434a;text-decoration:none;letter-spacing:-.05px}
.nav a svg{color:#8e8b84}
.nav a .ct{margin-left:auto;font-size:9px;color:#b0ada5}
.nav a.on{background:#e6f2a8;color:#23280f;font-weight:600}
.nav a.on svg{color:#3f4816}
.nav a.on .ct{color:#5f6a2a}

.assist{margin-top:auto;background:#e9f3af;border-radius:13px;padding:11px 11px 12px}
.assist .ah{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#2b3110}
.assist p{margin:6px 0 9px;font-size:9.5px;line-height:1.4;color:#5d6533}
.assist button{background:#fff;border:0;border-radius:7px;padding:4px 9px;font-size:9px;
  font-weight:600;color:#2b3110;box-shadow:0 1px 2px rgba(40,45,10,.12)}

.nav2{margin-top:12px;padding-top:9px;border-top:1px solid #ece9e1}
.me{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 4px 2px;border-top:1px solid #ece9e1}
.meav{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#d8d1c2,#8b8172);flex:none;
  display:grid;place-items:center;color:#fff;font-size:8.5px;font-weight:600}
.metx{flex:1;min-width:0}
.metx b{display:block;font-size:10.5px;font-weight:600}
.metx i{display:block;font-size:8.5px;font-style:normal;color:#a6a39b}
.me svg{color:#b3b0a8}

/* ---------------- 主区 ---------------- */
.main{flex:1;min-width:0;display:flex;flex-direction:column;padding:19px 21px 16px}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:13px}
.top h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.5px}
.top p{margin:4px 0 0;font-size:10.5px;color:#8d8d92;letter-spacing:-.05px}
.top p b{font-weight:500;color:#6d6d73}
.topr{display:flex;align-items:center;gap:7px}
.search{display:flex;align-items:center;gap:7px;width:236px;height:32px;padding:0 9px;
  background:#fff;border:1px solid #ece9e1;border-radius:999px;color:#a6a39b;font-size:10px}
.search .kbd{margin-left:auto;font-size:8.5px;border:1px solid #e7e4dc;border-radius:4px;
  padding:0.5px 4px;color:#b0ada5}
.ico{width:32px;height:32px;border-radius:50%;background:#fff;border:1px solid #ece9e1;
  display:grid;place-items:center;color:#4a4a50}
.primary{display:flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:0;border-radius:999px;
  background:#17171a;color:#fff;font-size:10.5px;font-weight:600;letter-spacing:-.1px}

.bar{display:flex;align-items:center;gap:7px;margin-bottom:13px}
.rnd{width:26px;height:26px;border-radius:50%;background:#fff;border:1px solid #ece9e1;
  display:grid;place-items:center;color:#55555b}
.dateb{height:29px;padding:0 6px;border:0;background:transparent;
  font-size:11.5px;font-weight:600;color:#1c1c20;letter-spacing:-.2px}
.today{height:29px;padding:0 12px;border-radius:999px;background:#fff;border:1px solid #ece9e1;
  font-size:10.5px;color:#33333a}
.barr{margin-left:auto;display:flex;align-items:center;gap:6px}
.sel{display:flex;align-items:center;gap:5px;height:29px;padding:0 10px;border-radius:999px;
  background:#fff;border:1px solid #ece9e1;font-size:10px;color:#3c3c43}
.seg{display:flex;align-items:center;gap:1px;height:29px;padding:3px;border-radius:999px;
  background:#efebe1;margin-left:3px}
.seg b,.seg span{display:flex;align-items:center;height:100%;padding:0 9px;border-radius:999px;
  font-size:10px;font-weight:400;color:#75736c}
.seg b{background:#fff;color:#1d1d21;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.09)}

.board{flex:1;min-height:0;display:flex;gap:12px}

/* ---------------- 日历 ---------------- */
.cal{flex:1;min-width:0;display:flex;flex-direction:column;background:#fff;
  border:1px solid #ece9e1;border-radius:14px;overflow:hidden}
.phead{display:grid;grid-template-columns:52px repeat(4,1fr);align-items:center;
  height:54px;flex:none;border-bottom:1px solid #f4f1ea}
.ph{display:flex;align-items:center;gap:7px;padding:0 8px;min-width:0}
.pav{width:25px;height:25px;border-radius:50%;flex:none;display:grid;place-items:center;
  color:#fff;font-size:8px;font-weight:600;box-shadow:0 0 0 1.5px #fff,0 0 0 2.5px #eeeae1}
.pa1{background:linear-gradient(135deg,#f2c39d,#c07a52)}
.pa2{background:linear-gradient(135deg,#c3d8f2,#6f95c8)}
.pa3{background:linear-gradient(135deg,#e6d4c0,#a97f57)}
.pa4{background:linear-gradient(135deg,#f0c2d0,#b96a83)}
.pi{min-width:0;flex:1}
.pi b{display:block;font-size:10px;font-weight:600;letter-spacing:-.15px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.pi i{display:block;font-size:8px;font-style:normal;color:#a6a39b;margin-top:1px}
.pbar{display:block;height:2px;border-radius:2px;background:#f0eee7;margin-top:4px;overflow:hidden}
.pbar s{display:block;height:100%;background:#cbdd8c;border-radius:2px;text-decoration:none}

.grid{flex:1;min-height:0;padding-top:3px;display:grid;grid-template-columns:52px repeat(4,1fr);position:relative;overflow:hidden}
.times{position:relative}
.tm{position:absolute;right:8px;transform:translateY(-50%);font-size:8px;color:#b3b0a8;letter-spacing:-.1px}
.tm.first{transform:translateY(1px)}
.col{position:relative;min-width:0;
  background-image:repeating-linear-gradient(to bottom,#f2efe7 0 1px,transparent 1px var(--hour))}
.col+.col{border-left:1px solid #f6f4ee}

.ev{position:absolute;left:4px;right:4px;border-radius:7px;border:1px solid #eeebe3;
  background:#fff;padding:4px 6px;overflow:hidden}
.ev .t{font-size:7.5px;color:#94918a;letter-spacing:-.1px;line-height:1.5}
.ev .n{font-size:9.5px;font-weight:600;color:#232327;letter-spacing:-.2px;line-height:1.15;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev .c{font-size:8px;color:#8a877f;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ev.g{background:#e5f1dd;border-color:#d4e6c7}
.ev.g .n{color:#28351f}
.ev.p{background:#ded3fb;border-color:#bca8f6;box-shadow:0 1px 3px rgba(124,83,244,.18)}
.ev.p::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#7c53f4}
.ev.p .t{color:#6f5fa0}
.ev.p .n,.ev.p .c{color:#2f2258}
.ev.plain{background:transparent;border:0;padding:1px 6px 0 6px}
.ev.plain .n{font-size:8px;font-weight:400;color:#aaa79f;letter-spacing:0}
.ev .bd{position:absolute;top:4px;right:4px;color:#a99a6a}
.ev.p .bd{color:#7c53f4}

.now{position:absolute;left:2px;right:0;height:1.5px;background:#df4339;z-index:4}
.now b{position:absolute;left:1px;top:-6.5px;background:#df4339;color:#fff;font-size:7px;
  font-weight:600;padding:1.5px 4px;border-radius:3px;letter-spacing:-.1px}

/* ---------------- 详情 ---------------- */
.panel{width:var(--panel);flex:none;display:flex;flex-direction:column;background:#fff;
  border:1px solid #ece9e1;border-radius:14px;overflow:hidden}
.pan-h{display:flex;align-items:center;gap:7px;padding:11px 12px;border-bottom:1px solid #f4f1ea;flex:none}
.pan-h b{font-size:11px;font-weight:600;letter-spacing:-.1px}
.state{font-size:8px;font-weight:600;background:#eef4d2;color:#4d5a20;border-radius:999px;padding:2.5px 7px}
.pan-h .sp{margin-left:auto;display:flex;gap:5px}
.mini{width:22px;height:22px;border-radius:6px;border:0;background:#f5f3ec;color:#55555b;display:grid;place-items:center}
.pan-b{flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;padding:11px 12px 0}
.pan-b>*{flex:none}

.client{background:#e7e1fa;border-radius:12px;padding:10px}
.cltop{display:flex;align-items:center;gap:8px}
.cav{width:33px;height:33px;border-radius:50%;flex:none;display:grid;place-items:center;
  background:linear-gradient(135deg,#f6d2bb,#c67f5f);color:#fff;font-size:9.5px;font-weight:600;
  box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.cltop b{display:block;font-size:11.5px;font-weight:600;letter-spacing:-.15px}
.cltop i{display:block;font-size:8px;font-style:normal;color:#6f6889;margin-top:1px}
.cbtns{margin-left:auto;display:flex;gap:5px}
.cbtn{width:21px;height:21px;border-radius:50%;background:#fff;border:0;display:grid;place-items:center;color:#4a4360}
.chips{display:flex;gap:5px;margin-top:9px}
.chip{font-size:8px;font-weight:600;border-radius:999px;padding:2.5px 8px;letter-spacing:-.05px}
.chip.d{background:#1d1d1f;color:#fff}
.chip.l{background:#e6f2a8;color:#3f4a12}

.rows{margin:13px 0 0;display:flex;flex-direction:column;gap:12px}
.row{display:flex;gap:8px;align-items:flex-start}
.ri{width:17px;height:17px;color:#8a8780;display:grid;place-items:center;flex:none;margin-top:1px}
.rk{display:block;font-size:8px;color:#b3b0a8;letter-spacing:.02em;line-height:1.6}
.rv{display:block;font-size:10px;color:#2b2b30;line-height:1.35;letter-spacing:-.1px}
.rv em{font-style:normal;color:#a9a69e}

.cut{border-top:1px solid #f4f1ea;margin:14px 0 14px;padding-top:12px}
.cuth{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.cuth b{font-size:10.5px;font-weight:600;letter-spacing:-.1px}
.cnt{font-size:8px;color:#6d6a63;background:#f5f3ec;border-radius:999px;padding:2px 7px}
.ck{display:flex;gap:7px;align-items:flex-start;padding:4.5px 0}
.cc{width:13px;height:13px;border-radius:50%;background:#e9f2c4;display:grid;place-items:center;
  flex:none;margin-top:1px;color:#5b6f1e}
.ck.off .cc{background:transparent;border:1.5px dashed #d2cec3;color:transparent}
.ck b{display:block;font-size:9.5px;font-weight:500;color:#2b2b30;letter-spacing:-.1px}
.ck i{display:block;font-size:8.5px;font-style:normal;color:#a9a69e;margin-top:0.5px}

.bill{border-top:1px solid #f4f1ea;padding:9px 12px 11px;margin:auto -12px 0;display:flex;flex-direction:column;gap:4px}
.bl{display:flex;justify-content:space-between;font-size:9px;color:#5f5c56;letter-spacing:-.05px}
.bl.due{font-size:10.5px;font-weight:600;color:#17171a;border-top:1px solid #f4f1ea;
  margin-top:4px;padding-top:6px}
.pay{display:flex;align-items:center;gap:5px;margin-top:7px}
.pay .vi{width:17px;height:11px;border-radius:2px;background:#eef;border:1px solid #dcd8ce;
  display:grid;place-items:center;font-size:6px;font-weight:700;color:#4a5a9a;flex:none}
.pay span{font-size:8px;color:#a9a69e}
.co{margin-left:auto;display:flex;align-items:center;gap:5px;height:27px;padding:0 9px;border:0;
  border-radius:7px;background:#17171a;color:#fff;font-size:9px;font-weight:600}

/* ---------------- 提示条 ---------------- */
.toast{position:absolute;left:50%;transform:translateX(-50%);bottom:17px;width:410px;
  display:flex;align-items:center;gap:9px;padding:8px 9px 8px 11px;border-radius:13px;
  background:#1c1c1e;color:#fff;box-shadow:0 14px 34px rgba(12,10,20,.32)}
.tk{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;
  background:linear-gradient(135deg,#7cc47f,#2f7d4f);color:#fff}
.tt{min-width:0}
.tt b{display:block;font-size:10px;font-weight:600;letter-spacing:-.1px}
.tt i{display:block;font-size:8px;font-style:normal;color:#b6b6ba;margin-top:1px;letter-spacing:-.05px}
.ta{margin-left:auto;display:flex;gap:5px}
.tb{height:23px;padding:0 8px;border-radius:6px;border:1px solid #3a3a3d;background:#242427;
  color:#f2f2f3;font-size:8.5px;font-weight:500}
      `
    }
  ]
};

/* SCHEMA —— 一条布局片段的完整字段口径（与 docs/布局图册形态设计-v1.md 一致）
   {
     id:        小写字母、数字与连字符，全册唯一
     name:      列表与标题上的名字
     group:     CATALOG.groups 里某个 id
     tags:      [] 扁平小标签，用于在册内搜索与筛选，不产生层级
     summary:   一句话讲清它是什么，卡片上最多两行
     note:      一句话讲清什么时候别用它，只在详情出现
     source:    { title, url } 可选，出处
     previewVw: 预览用的逻辑视口宽（px），缺省 1024
     params:    [] 可调项，全部实现为 CSS 变量
                  name  变量名，CSS 里写 var(--name)
                  label 滑块上的名字
                  min / max / step / value  数值
                  unit  单位字符串，px / ch / 空
     html:      片段的 markup，不要包 <html><body>
     css:       片段的样式。类名可以放平坦 —— 预览在独立 iframe 里，污染不到外面

   一条硬规矩：params 的名字与 css 里用到的 var(--…) 必须严格一一对应。
   多了漏了都不行 —— 滑块改不动预览，或预览里的值找不到滑块，这条就失真了，
   而它是唯一会被当成「册上写的都对」的东西。
*/
