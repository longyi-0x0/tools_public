/**
 * 形态登记处。
 *
 * 一个形态就是一个文件，默认导出 `{ id, label, hint, styles, create }`：
 *
 * ```js
 * export default {
 *   id: 'my-stage',
 *   label: '我的形态',
 *   hint: '一句话说它怎么动',
 *   styles: new URL('./my-stage.css', import.meta.url).href,
 *   create(host) {
 *     // 把画面挂进 host，返回 { begin, reveal, reset, destroy }
 *   },
 * };
 * ```
 *
 * 加新形态只需要两步：在 `stages/` 下新建文件，把它加进下面的数组。
 * 界面的下拉、数据校验、舞台装载都从这里读，不用改别处。
 */

import ball from './ball.js';
import cards from './cards.js';
import list from './list.js';
import wheel from './wheel.js';

/** 展示顺序就是这里的顺序。 */
export const STAGES = [list, cards, wheel, ball];

export const DEFAULT_STAGE = STAGES[0].id;

export const STAGE_IDS = STAGES.map((stage) => stage.id);

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

/** 认不出的 id 一律退回第一种形态，界面不会因为旧数据而空着。 */
export function stageInfo(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_STAGE);
}

export function stageLabel(id) {
  return stageInfo(id).label;
}

/** 合法的形态 id（数据层校验用）。 */
export function isStageId(id) {
  return BY_ID.has(id);
}

/**
 * 每个形态自己的样式。模块加载时一次性挂上，切形态不会先闪一下没样式；
 * 文件很小，多挂几个链接也无所谓。
 */
function loadStyles() {
  for (const stage of STAGES) {
    if (!stage.styles || document.querySelector(`link[data-stage="${stage.id}"]`) !== null) {
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stage.styles;
    link.dataset.stage = stage.id;
    document.head.append(link);
  }
}

// 只在浏览器里挂样式；node 跑单测时没有 document。
if (typeof document !== 'undefined') {
  loadStyles();
}

export function createStage(id, host) {
  return stageInfo(id).create(host);
}
