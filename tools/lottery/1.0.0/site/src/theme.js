/**
 * 主题：只是主页的配色，不参与抽奖数据。
 *
 * 每套主题在 styles.css 里以 `[data-theme]` 定义；这里只负责记住选择与
 * 切换 `html` 上的属性。抽奖页是暗场，不受这里影响。
 */

const KEY = 'lottery.theme.v1';

export const THEMES = [
  {
    id: 'paper',
    label: '纸白',
    hint: '中性微暖',
    swatch: ['#f7f7f4', '#15151a'],
  },
  {
    id: 'sand',
    label: '暖沙',
    hint: '偏黄的纸',
    swatch: ['#f6f1e6', '#1f1a13'],
  },
  {
    id: 'forest',
    label: '墨绿',
    hint: '深绿做主色',
    swatch: ['#eef2ed', '#17402b'],
  },
  {
    id: 'indigo',
    label: '靛蓝',
    hint: '冷一点的蓝灰',
    swatch: ['#eef1f8', '#25368f'],
  },
  {
    id: 'slate',
    label: '石墨',
    hint: '始终是暗的',
    swatch: ['#0e0f11', '#f2f3f5'],
  },
];

const DEFAULT_THEME = 'paper';

function isValid(id) {
  return THEMES.some((theme) => theme.id === id);
}

export function loadTheme() {
  try {
    const id = window.localStorage.getItem(KEY);
    return isValid(id) ? id : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id) {
  const next = isValid(id) ? id : DEFAULT_THEME;
  document.documentElement.dataset.theme = next;
  return next;
}

export function saveTheme(id) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* 隐私模式：本次照用，关掉就忘 */
  }
}
