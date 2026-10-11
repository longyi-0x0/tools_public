/**
 * 时长与日期的写法。
 *
 * 时长有两套：格子与导出的表里用 `时:分:秒` —— 一列数上下对齐才好比长短，大屏上的
 * 数字宽度也得稳；小结那句中文用「1 小时 12 分」，念出来顺。补零只写一遍。
 */

/** 秒数补成两位。 */
const pad = (value) => String(value).padStart(2, '0');

/**
 * 表盘：`12:34` / `1:02:03`。
 *
 * `alwaysHours` 为真时小时位一直留着 —— 大屏上的数字宽度得稳，走到一小时不能忽然
 * 从「12:34」跳成「1:02:03」。
 */
function clock(ms, alwaysHours = false) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const body = `${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  if (hours === 0 && !alwaysHours) {
    return body;
  }
  return `${alwaysHours ? pad(hours) : String(hours)}:${body}`;
}

/** 一条离开的时长：`12:34`；超过一小时 → `1:02:03`。 */
export function formatDuration(ms) {
  return clock(ms);
}

/**
 * 写给人看的时长：`1 小时 12 分` / `20 分 02 秒` / `40 秒`。
 *
 * 小结是念出来的一句话，用中文单位；大时钟是给教室看的表盘，才用 `时:分:秒`。
 */
export function formatSpan(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes} 分 ${pad(seconds)} 秒` : `${minutes} 分`;
  }
  return `${seconds} 秒`;
}

/**
 * 自习时间：一律 `时:分:秒`，两位一段。
 *
 * 大屏上的那个数，小时位一直留着（见 [`clock`]）。
 */
export function formatStudyTime(ms) {
  return clock(ms, true);
}

/** 表里的时刻：`2026-10-11 09:30`。 */
export function formatDate(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件名里的日期：`2026-10-11`。 */
export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
