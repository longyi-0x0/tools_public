/**
 * IMP8 回归（UI-REVIEW M1/M3/M4/M6）：四条断言，全部不起 DOM、不装浏览器。
 * ① `[` / `]` 互斥；② 检查行两档文案；③ 保存失败态 + 点击重试；④ 解域实体行「新建关系」。
 * FIX8（REV2 M9 / N1 / N3 / N8 / N9）：⑤ 窄屏收起抽屉与遮罩一起隐藏；⑥ 空态卡三项规格；
 * ⑦ 把手定位走 `--pd-detail-w`；⑧ 样式表里没有裸属性选择器 / 1px 绕过 / `.stage-hint` 死代码。
 * 运行：`npm test`（本文件接在测试列表末尾）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cancelConnect,
  setCanvasOpen,
  setDetailOpen,
  setDomain,
  toggleCanvas,
  toggleDetail,
} from './commands.ts';
import { getUiState } from './uiStore.ts';
import {
  commitDoc,
  getDocState,
  initDoc,
  markSaved,
  setReadOnly,
  setSaveError,
} from './docStore.ts';
import { createWorkspacePersister } from './persistence.ts';
import { createWorkspace } from '../domain/factory.ts';
import { stableStringify } from '../domain/serialize.ts';
import { STORAGE_KEYS, createMemoryStorage, type StorageLike } from './storage.ts';
import { checkSummaryText } from '../ui/checkText.ts';
import { saveLabel } from '../ui/saveLabel.ts';
import { ENTITY_ROW_MENU } from '../ui/treeMenus.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOW = '2026-11-17T00:00:00.000Z';

test('① `[` 与 `]` 互斥：收一块时把另一块放回来', () => {
  // App.tsx 的 `[` / `]` 键处理器逐字调这两个命令，所以这里测命令就覆盖了键盘路径。
  setCanvasOpen(true);
  setDetailOpen(true);
  toggleCanvas();
  assert.equal(getUiState().canvasOpen, false, '`[` 后画板收起');
  assert.equal(getUiState().detailOpen, true, '收画板时详情必须开着（不能同时收）');
  toggleDetail();
  assert.equal(getUiState().detailOpen, false, '`]` 后详情收起');
  assert.equal(getUiState().canvasOpen, true, '收详情时画板被放回来（互斥）');
  // 反向：把两块都摆开，先收详情、再收画板，同样把前一个放回来。
  setCanvasOpen(true);
  setDetailOpen(true);
  toggleDetail();
  assert.equal(getUiState().detailOpen, false);
  assert.equal(getUiState().canvasOpen, true);
  toggleCanvas();
  assert.equal(getUiState().canvasOpen, false);
  assert.equal(getUiState().detailOpen, true, '再收画板时详情被放回来');
  setCanvasOpen(true);
  setDetailOpen(true);
});

test('① App.tsx：`[` 接 toggleCanvas，data-canvas 读真实状态（不是硬编码 on）', () => {
  const source = fs.readFileSync(path.join(HERE, '..', 'App.tsx'), 'utf8');
  assert.match(source, /event\.key === '\['/, '`[` 必须有自己的键分支');
  assert.match(source, /toggleCanvas\(\)/, '`[` 落点是 toggleCanvas');
  assert.doesNotMatch(source, /本轮不做/, '「`[` 收画板本轮不做」那句必须删掉');
  assert.match(source, /data-canvas=\{ui\.canvasOpen \? 'on' : 'off'\}/, 'data-canvas 读真实状态');
  assert.match(source, /title="收起画板（\[）"/, '画板把手有收起态 title');
  assert.match(source, /title="展开画板（\[）"/, '画板把手有展开态 title');
});

test('② 检查行文案两档：一个 error + 一个 warning = 检查 2 条 · 1 错误 1 警告', () => {
  const findings = [{ severity: 'error' }, { severity: 'warning' }];
  assert.equal(checkSummaryText(findings), '检查 2 条 · 1 错误 1 警告');
  assert.equal(checkSummaryText([]), '检查 0 条 · 0 错误 0 警告');
  assert.equal(checkSummaryText([{ severity: 'error' }]), '检查 1 条 · 1 错误 0 警告');
  // 「提示」档已删：不认识的严重度不进计数（IMP8 裁定两档）
  assert.equal(checkSummaryText([{ severity: '提示' }]), '检查 0 条 · 0 错误 0 警告');
});

/** 会抛错的 storage：只让 workspace 键的前 N 次写入失败，之后恢复正常（模拟「点重试就好了」）。 */
function flakyStorage(failures: number): StorageLike {
  const inner = createMemoryStorage();
  let left = failures;
  const storage = {
    getItem: (key: string): string | null => inner.getItem(key),
    setItem: (key: string, value: string): void => {
      if (key === STORAGE_KEYS.workspace && left > 0) {
        left -= 1;
        throw new Error('模拟写入失败');
      }
      inner.setItem(key, value);
    },
    removeItem: (key: string): void => {
      inner.removeItem(key);
    },
  };
  return storage as unknown as StorageLike;
}

test('③ 保存失败态：写盘抛错 → 「⚠ 保存失败（点击重试）」，点击重试后恢复「✓ 已保存」', () => {
  initDoc(createWorkspace(NOW));
  commitDoc((ws) => ({ ...ws, name: '保存失败试跑' }));
  assert.equal(
    saveLabel({ saveError: getDocState().saveError, dirty: getDocState().dirty }).text,
    '保存中…',
    '刚改完是「保存中…」',
  );

  const storage = flakyStorage(2);
  const persister = createWorkspacePersister({
    storage,
    read: () => stableStringify(getDocState().ws),
    onSaved: markSaved,
    onSaveFailed: setSaveError,
    onReadOnly: setReadOnly,
  });

  persister.flush();
  assert.notEqual(getDocState().saveError, null, '失败必须上报（persistence 不再静默吞掉）');
  assert.ok(
    (getDocState().saveError ?? '').includes('模拟写入失败'),
    `失败原因要能展示在 title 里，实际：${String(getDocState().saveError)}`,
  );
  assert.equal(
    saveLabel({ saveError: getDocState().saveError, dirty: getDocState().dirty }).text,
    '⚠ 保存失败（点击重试）',
    '第三态文案',
  );

  // StatusBar 的点击 = bootstrap 的 retrySave() = persister.retry()
  persister.retry();
  assert.equal(getDocState().saveError, null, '重试成功后清掉失败态');
  assert.equal(
    saveLabel({ saveError: getDocState().saveError, dirty: getDocState().dirty }).text,
    '✓ 已保存',
  );
});

test('④ 解域实体行「新建关系」进入连线模式（与段头 ＋ 同一个 startConnect）', () => {
  setDomain('solve');
  const item = ENTITY_ROW_MENU.find((entry) => entry.label === '新建关系');
  assert.ok(item, '实体行菜单必须有「新建关系」');
  assert.equal(getUiState().connect, null, '初始不在连线');
  item.run('entity-1');
  assert.deepEqual(getUiState().connect, { sourceId: null }, '点了「新建关系」就进连线模式');
  cancelConnect();
  assert.equal(getUiState().connect, null);

  const labels = ENTITY_ROW_MENU.map((entry) => entry.label);
  assert.deepEqual(labels, ['新建关系', '重命名', '删除实体'], '实体行菜单三项');
});

/** 读 src/styles 下的样式表并剥掉注释：注释里也会出现 data-selected 之类字样，不剥会把说明当成选择器。 */
function styleSheet(name: string): string {
  const css = fs.readFileSync(path.join(HERE, '..', 'styles', name), 'utf8');
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('⑤ 窄屏收起详情：抽屉与遮罩一起隐藏（REV2 N3 真回归）', () => {
  const css = styleSheet('views.css');
  const narrowAt = css.indexOf('@media (max-width:1199px)');
  assert.ok(narrowAt > 0, 'views.css 必须有窄屏媒体块');
  const narrow = css.slice(narrowAt);

  // 窄屏 .detail 是绝对定位覆盖层，栅格列收到 0 对它无效，必须有一条显式隐藏规则。
  const hide = narrow.match(/\.app\[data-right="off"\] \.detail,\s*\.app\[data-right="off"\] \.detail-scrim\{([^}]*)\}/);
  assert.ok(hide, '窄屏必须有 [data-right="off"] 下隐藏 .detail / .detail-scrim 的规则');
  assert.match(hide[1], /visibility:hidden/, '收起态用 visibility:hidden');
  assert.match(hide[1], /pointer-events:none/, '收起态不再吃点击');
  assert.doesNotMatch(narrow, /\[data-right="on"\][^{]*\{[^}]*visibility:hidden/, '展开态不许隐藏抽屉');

  // 媒体块之外（宽屏）不隐藏：宽屏收起靠栅格列收 0。
  assert.doesNotMatch(css.slice(0, narrowAt), /\.detail[^{]*\{[^}]*visibility:hidden/, '宽屏不套用这条隐藏');
});

test('⑤ 状态函数：收起点遮罩 / `]` 都把 data-right 变成 off，App 没有新增状态', () => {
  setCanvasOpen(true);
  setDetailOpen(true);
  assert.equal(getUiState().detailOpen ? 'on' : 'off', 'on', '展开时 data-right="on"');
  // 窄屏点遮罩 = App.tsx 里 detail-scrim 的 onClick
  setDetailOpen(false);
  assert.equal(getUiState().detailOpen, false, '收起后 detailOpen=false');
  assert.equal(getUiState().detailOpen ? 'on' : 'off', 'off', '收起后 data-right="off"，窄屏隐藏规则随之命中');
  assert.equal(getUiState().canvasOpen, true, '收起详情时画板被放回来（互斥），抽屉关掉后画板可见');

  const source = fs.readFileSync(path.join(HERE, '..', 'App.tsx'), 'utf8');
  assert.match(source, /data-right=\{ui\.detailOpen \? 'on' : 'off'\}/, 'data-right 读真实状态，不新增一套状态');
  assert.match(source, /className="detail-scrim"/, '遮罩节点还在');
  assert.match(source, /onClick=\{\(\) => setDetailOpen\(false\)\}/, '遮罩点击落点 = setDetailOpen(false)');
  assert.match(source, /\{ui\.detailOpen && \(/, '收起时遮罩直接不渲染（CSS 隐藏是第二道保险）');
});

test('⑥ 空态卡三项规格：内距 sp-4 / 宽 300 / 主按钮主色底 + 反白', () => {
  const css = styleSheet('canvas.css');
  const card = css.match(/\.emptycard\{([^}]*)\}/);
  assert.ok(card, '.emptycard 规则必须存在');
  assert.match(card[1], /padding:var\(--pd-sp-4\)/, '内距用 --pd-sp-4（24px），不是 20px');
  assert.match(card[1], /width:300px/, '稿要求宽 300');

  const primary = css.match(/\.primary-btn\{([^}]*)\}/);
  assert.ok(primary, '.primary-btn 必须存在');
  assert.match(primary[1], /background:var\(--pd-accent\)/, '主按钮主色底');
  assert.match(primary[1], /color:var\(--pd-bg-2\)/, '文字反白（浅色主题是白、深色主题是深底）');
  assert.doesNotMatch(primary[1], /#[0-9a-fA-F]{3,6}/, '不许裸 hex');

  const source = fs.readFileSync(path.join(HERE, '..', 'ui', 'ProblemCanvas.tsx'), 'utf8');
  assert.match(source, /className="primary-btn" onClick=\{\(\) => beginDraft\(null\)\}/, '主按钮 = 新建核心问题');
  assert.match(source, /className="ghost-btn" onClick=\{\(\) => fileInput\.current\?\.click\(\)\}/, '次按钮保持 ghost');
});

test('⑦ 把手定位走 --pd-detail-w：不再写死 340', () => {
  const css = styleSheet('views.css');
  assert.match(css, /--pd-detail-w:340px/, '详情宽度的唯一来源');
  assert.match(css, /\.content\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--pd-detail-w\)/, '栅格列引用变量');
  assert.match(css, /\.handle\.hc\{[^}]*right:calc\(var\(--pd-detail-w\) \+ 6px - 12px\)/, '把手定位引用变量');
  assert.doesNotMatch(css, /right:calc\(340px/, '不许再写死 340');
  assert.equal((css.match(/340px/g) ?? []).length, 1, '340 只在变量定义里出现一次');
  // 窄屏抽屉下把手跟着变，而不是悬在抽屉底下
  assert.match(css, /\.app\[data-right="on"\] \.handle\.hc\{right:var\(--pd-detail-w\)\}/, '抽屉开着时把手贴抽屉左沿');
  assert.match(css, /\.app\[data-right="off"\] \.handle\.hc\{right:0\}/, '收起详情后把手贴右列右沿');
});

test('⑧ 样式表没有裸属性选择器 / 1px 绕过 / `.stage-hint` 死代码', () => {
  for (const name of ['base.css', 'tokens.css', 'components.css', 'canvas.css', 'views.css', 'flow.css']) {
    const css = styleSheet(name);
    assert.deepEqual(
      css.match(/\[data-[a-z-]+\]/g) ?? [],
      [],
      `${name}：不许有裸属性选择器（React 会把布尔 false 渲染成字符串 "false"）`,
    );
    assert.deepEqual(
      css.match(/box-shadow:\s*0 0 0 1px/g) ?? [],
      [],
      `${name}：1px 边框绕过必须改 1.5px 环或纯底色`,
    );
    assert.doesNotMatch(css, /\.stage-hint/, `${name}：.stage-hint 没人引用，属于死代码`);
  }
  // 不是把规则删掉了事：四处有值选择器仍在，1px 细线改成 1.5px 红环
  const canvas = styleSheet('canvas.css');
  for (const attr of ['data-dragging="true"', 'data-core="true"', 'data-connect-source="true"', 'data-unsupported="true"']) {
    assert.ok(canvas.includes(`[${attr}]`), `${attr} 必须有值选择器`);
  }
  assert.match(
    canvas,
    /\.tag\[data-unsupported="true"\]\{box-shadow:0 0 0 1\.5px var\(--pd-red-3\)\}/,
    '未支撑标签的细线 = 1.5px 红环',
  );
  // 工具条第 5 枚「图」保留，但窄屏隐去，不挡内容
  assert.match(canvas, /@media \(max-width:1199px\)\{[^}]*\.minimap-toggle\{display:none\}/, '窄屏隐去缩略图开关');
  assert.match(
    fs.readFileSync(path.join(HERE, '..', 'ui', 'ProblemCanvas.tsx'), 'utf8'),
    /className="minimap-toggle"/,
    '「图」按钮保留并挂上可被窄屏隐藏的类名',
  );
});
