/**
 * 冒烟：把 site/index.html 塞进 jsdom，用一份 v4 旧存档跑一遍渲染，
 * 确认迁移（role → 绑定）、列表、池素材、两池徽标、弹窗在真实 DOM 里都成立。
 *
 * 单元测试（`npm test`）不覆盖主程序，它只碰 DOM；这一份补上那一段。
 * 需要 jsdom：在 lottery/ 下 `npm i -D jsdom`，然后
 * `node tests/smoke/index.mjs`。不进 `npm test`，也不随工具发布。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const SITE = fileURLToPath(new URL('../../site/', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}${extra === '' ? '' : ` — ${extra}`}`);
    failures.push(label);
  }
};

const html = readFileSync(`${SITE}/index.html`, 'utf8').replace(/<script type="module"[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost:8787/', pretendToBeVisual: true });
const { window } = dom;

// canvas 只在预览里用，给个空实现就够了
window.HTMLCanvasElement.prototype.getContext = () => ({
  clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
  closePath() {}, fill() {}, stroke() {}, save() {}, restore() {}, translate() {},
  rotate() {}, scale() {}, fillText() {}, measureText: () => ({ width: 10 }),
  createLinearGradient: () => ({ addColorStop() {} }), setTransform() {}, quadraticCurveTo() {},
});
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
// jsdom 还没实现 dialog 的模态方法，补上最简版
window.HTMLDialogElement.prototype.showModal = function showModal() {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function close() {
  this.open = false;
  this.dispatchEvent(new window.Event('close'));
};
window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(Date.now()), 16);

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
// stages/*.js 是裸用这几个构造函数的（浏览器里它们本来就是全局），一并挂到全局
globalThis.ResizeObserver = window.ResizeObserver;
globalThis.MutationObserver = window.MutationObserver;

/**
 * v4 的一份存档：池带 `role`、抽奖没有 `slots`，而且有两个同 role 的名单池。
 * 这是最难迁的一种 —— 迁完第一个进绑定，第二个要留着并标「未参与」。
 */
const people = [
  { id: 'p1', name: '张三', dept: '研发', employeeId: 'A1' },
  { id: 'p2', name: '李四', dept: '市场', employeeId: 'A2' },
  { id: 'p3', name: '王五', dept: '设计', employeeId: 'A3' },
];
const otherPeople = [{ id: 'p1', name: '赵六', dept: '运营', employeeId: 'B1' }];
const prizes = [
  { id: 'a1', name: '一等奖', capacity: 1, weight: 1, meta: { level: '1' } },
  { id: 'a2', name: '二等奖', capacity: 2, weight: 1, meta: { level: '2' } },
];

const v4 = {
  version: 4,
  pools: [
    { id: 'k1', name: '研发名单', kind: 'people', entries: people },
    { id: 'k2', name: '市场名单', kind: 'people', entries: otherPeople },
    { id: 'k3', name: '奖品', kind: 'prizes', entries: prizes },
  ],
  lotteries: [
    {
      id: 'g1',
      title: '年会抽奖',
      protocol: 'prize-person',
      stage: 'wheel',
      stageConfig: {},
      pools: [
        { id: 'k1', name: '研发名单', kind: 'people', role: 'people', entries: people },
        { id: 'k2', name: '市场名单', kind: 'people', role: 'people', entries: otherPeople },
        { id: 'k3', name: '奖品', kind: 'prizes', role: 'prizes', entries: prizes },
      ],
      results: [
        {
          id: 'r1',
          at: Date.now(),
          protocol: 'prize-person',
          picks: [
            { slot: 'prize', poolId: 'k3', entryId: 'a1', name: '一等奖', meta: {} },
            { slot: 'person', poolId: 'k1', entryId: 'p1', name: '张三', meta: { dept: '研发' } },
          ],
        },
      ],
      excluded: [],
    },
  ],
};
window.localStorage.setItem('lottery.app.v4', JSON.stringify(v4));

console.log('启动：v4 存档 + 迁移成 v5');
await import(pathToFileURL(`${SITE}/src/main.js`).href);
await new Promise((resolve) => setTimeout(resolve, 300));

const text = () => window.document.getElementById('app').textContent;
const has = (needle) => text().includes(needle);
const buttons = () => [...window.document.querySelectorAll('button')];
const labels = () => [...new Set(buttons().map((node) => node.textContent.trim()))];

check('渲染出了抽奖卡片', has('年会抽奖'));
check('奖项跟着迁移过来', has('一等奖'));
check('开奖记录里的人还在', has('张三'));
check('存档已写成 v5', window.localStorage.getItem('lottery.app.v5') !== null);
check('v4 原文留了备份', window.localStorage.getItem('lottery.app.v4.backup') !== null);
check('v4 原键已清掉', window.localStorage.getItem('lottery.app.v4') === null);
check('侧栏有「抽法」区', has('抽法'));
check('侧栏有「绑定」区', has('绑定'));

console.log('\n两个同 kind 的池');
check('两个名单池都显示', has('研发名单') && has('市场名单'));
check('没绑定的那个标「未参与」', has('未参与'));
const saved = JSON.parse(window.localStorage.getItem('lottery.app.v5'));
check(
  '绑定只指向第一个名单池',
  saved.lotteries[0].slots.person === 'k1',
  JSON.stringify(saved.lotteries[0].slots),
);
check('第二个名单池没被丢掉', saved.lotteries[0].pools.length === 3);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const modalText = () => window.document.getElementById('modal').textContent;
const bindSelect = (label) =>
  [...window.document.querySelectorAll('.rail select')].find(
    (node) => node.getAttribute('aria-label') === label,
  );
const mutedPools = () =>
  [...window.document.querySelectorAll('.section')]
    .filter((section) => section.querySelector('.pool-tag.muted') !== null)
    .map((section) => section.querySelector('.pool-name')?.textContent ?? '');

console.log('\n改绑定');
const personSelect = bindSelect('中奖人');
if (personSelect === undefined) {
  check('右侧栏有「中奖人」绑定的下拉', false);
} else {
  personSelect.value = 'k2';
  personSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(150);
  const swapped = JSON.parse(window.localStorage.getItem('lottery.app.v5'));
  check('换绑写进了存档', swapped.lotteries[0].slots.person === 'k2', JSON.stringify(swapped.lotteries[0].slots));
  check('「未参与」跟着挪到研发名单', mutedPools().includes('研发名单'), mutedPools().join(' | '));
  check('市场名单不再是「未参与」', !mutedPools().includes('市场名单'), mutedPools().join(' | '));
}

console.log('\n一次抽几个');
const batchInput = window.document.querySelector('.rail input[type="number"]');
if (batchInput === null) {
  check('侧栏有「一次抽」输入框', false);
} else {
  batchInput.value = '3';
  batchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  batchInput.dispatchEvent(new window.Event('blur'));
  await wait(150);
  const sized = JSON.parse(window.localStorage.getItem('lottery.app.v5')).lotteries[0];
  check('一次抽几个写进存档', sized.batchSize === 3 && sized.batch === 3, `${sized.batchSize}/${sized.batch}`);
}

console.log('\n池弹窗：用于 / 加池');
const edit = buttons().find((node) => node.textContent.trim() === '编辑');
if (edit === undefined) {
  check('找得到池的「编辑」', false, labels().join(' | '));
} else {
  edit.click();
  await wait(150);
  check('弹窗里有「用于」', /用于/.test(modalText()), modalText().slice(0, 120));

  const prizeChip = [...window.document.querySelectorAll('#modal .choice')].find(
    (node) => node.textContent.trim() === '奖项',
  );
  if (prizeChip === undefined) {
    check('找得到「奖项」这个槽的芯片', false, modalText().slice(0, 160));
  } else {
    prizeChip.click();
    await wait(150);
    const bound = JSON.parse(window.localStorage.getItem('lottery.app.v5')).lotteries[0].slots;
    check('一个池可以同时填两个槽', bound.prize === 'k1' && bound.person === 'k2', JSON.stringify(bound));
  }

  const addPool = [...window.document.querySelectorAll('#modal button')].find(
    (node) => node.textContent.trim() === '加池',
  );
  if (addPool === undefined) {
    check('找得到「加池」', false, modalText().slice(0, 160));
  } else {
    addPool.click();
    await wait(150);
    check('加池弹窗列出了素材池', /研发名单/.test(modalText()), modalText().slice(0, 160));
    const emptyItem = [...window.document.querySelectorAll('#modal button')].find(
      (node) => node.textContent.trim() === '新建空条目',
    );
    if (emptyItem === undefined) {
      check('找得到「新建空条目」', false, modalText().slice(0, 200));
    } else {
      emptyItem.click();
      await wait(150);
      const grown = JSON.parse(window.localStorage.getItem('lottery.app.v5')).lotteries[0];
      check('空池加进去了', grown.pools.length === 4, String(grown.pools.length));
      check('新池还没绑任何槽', grown.slots.prize === 'k1' && grown.slots.person === 'k2');
    }
  }
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  await wait(120);
}

console.log('\n切到池素材视图');
const poolTab = buttons().find((node) => node.textContent.trim() === '池');
if (poolTab === undefined) {
  check('找得到池素材入口', false, labels().join(' | '));
} else {
  poolTab.click();
  await new Promise((resolve) => setTimeout(resolve, 150));
  check('池素材视图渲染出三个池', has('研发名单') && has('奖品'));
  check('人池标了条数', /人 · 3 条/.test(text()), text().replace(/\s+/g, ' ').slice(0, 200));

  console.log('\n  点开奖品池');
  const prizePool = buttons().find((node) => /奖品/.test(node.textContent));
  if (prizePool === undefined) {
    check('找得到奖品池入口', false, labels().join(' | '));
  } else {
    prizePool.click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    check('奖品池按名额算', /名额|不限/.test(text()), text().replace(/\s+/g, ' ').slice(0, 220));
  }
}

console.log('\n打开「新建」弹窗');
// 先切回抽奖视图：池视图里的「新建」是直接建一个素材池
buttons().find((node) => node.textContent.trim() === '抽奖')?.click();
await wait(150);
const before = buttons().length;
const plus = buttons().find((node) => /新建/.test(node.getAttribute('aria-label') ?? ''));
if (plus === undefined) {
  check('找得到新建按钮', false, labels().join(' | '));
} else {
  plus.click();
  await wait(150);
  const newItem = [...window.document.querySelectorAll('#modal button')].find(
    (node) => node.textContent.trim() === '新建',
  );
  if (newItem === undefined) {
    check('找得到「新建」这一项', false, modalText().slice(0, 160));
  } else {
    newItem.click();
    await wait(180);
    check('弹窗里有内容', modalText().length > 0);
    check('弹窗进了打开状态', buttons().length >= before);

    const slotSelects = [...window.document.querySelectorAll('#modal .new-form select')];
    check('新建表单每个槽一个下拉', slotSelects.length >= 2, String(slotSelects.length));
    if (slotSelects.length >= 2) {
      // 多池时不再自动猜绑定，两个槽都得自己选
      check('多池时槽默认不绑', slotSelects.every((node) => node.value === ''), slotSelects.map((n) => n.value).join(','));
      slotSelects[0].value = 'k1';
      slotSelects[0].dispatchEvent(new window.Event('change', { bubbles: true }));
      await wait(80);
      slotSelects[1].value = 'k2';
      slotSelects[1].dispatchEvent(new window.Event('change', { bubbles: true }));
      await wait(120);
      const create = [...window.document.querySelectorAll('#modal button')].find(
        (node) => node.textContent.trim() === '创建',
      );
      create?.click();
      await wait(200);
      const created = JSON.parse(window.localStorage.getItem('lottery.app.v5')).lotteries[1];
      check('新建的这场按选的下拉绑定', created?.slots.person === 'k2', JSON.stringify(created?.slots));
      check('只把绑到的池复制进来', created?.pools.length === 2, String(created?.pools.length));
    }
  }
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  await wait(150);
}

console.log(`\n${failures.length === 0 ? '冒烟通过' : `冒烟失败 ${failures.length} 项`}`);
process.exit(failures.length === 0 ? 0 : 1);
