/**
 * 教室的响度：把麦克风的波形读成 0–100 的整数，再看它跟老师划的那条线谁高。
 *
 * 这个数**不是校准过的声压级**。每台机器的麦克风利得都不一样，同一个教室换台电脑就是
 * 另一个数，所以阈值是「一个班一台机器」当场调出来的，不是放之四海皆准的标准。它的用处
 * 是纵向比较：比刚才静了还是吵了、越过老师划的那条线没有。
 *
 * 这一层不认识浏览器：波形的来路（麦克风）与读数的去处（界面）都在别处，所以它可以拿
 * 假波形与假时钟直接推演。
 */

/** 读数上限。0 是听不见，100 是振到顶。 */
export const LEVEL_CEILING = 100;

/** 读一次的间隔。100 毫秒 —— 比人耳分得出的一段短，又比屏幕刷新慢。 */
export const READING_PERIOD_MS = 100;

/** 显示的那个数往新值靠的比例。生值直接摆出来数字会一直跳，老师反而看不清。 */
const SMOOTH_FACTOR = 0.3;

/**
 * 连着几个读数越过阈值才算真的「吵起来了」。300 毫秒。
 *
 * 一声关门、一下拖椅子都会把读数顶上去，但那不是教室吵起来了 —— 为它们换一次脸，
 * 屏幕上就只剩闪烁。
 */
const RISE_FRAMES = 3;

/** 低于阈值这么多才算是往「静下来」走。在阈值线上来回蹭的读数不该反复改判。 */
const HYSTERESIS = 5;

/** 低于（阈值 − 迟滞）之后，还要守满这么久才认「静下来了」。 */
const FALL_HOLD_MS = 1000;

/**
 * 吵着没停满这么久才提醒一声。
 *
 * 一次物响就出声是不行的：教室里一声一声地响，提醒音会比教室还吵。所以这里是
 * 「吵得停不下来」才管，而且一次吵只提醒一次，静下来之后再吵才算新的一次。
 */
export const ALERT_HOLD_MS = 10 * 1000;

/** 阈值的默认值与能调的范围、刻子。 */
export const THRESHOLD_DEFAULT = 60;
export const THRESHOLD_MIN = 30;
export const THRESHOLD_MAX = 85;
export const THRESHOLD_STEP = 5;

/** 收进 0–100。 */
function clampLevel(value) {
  return Math.min(LEVEL_CEILING, Math.max(0, Math.round(value)));
}

/**
 * 一截波形（−1..1 的浮点）换成 0–100。
 *
 * −100 dBFS 记 0、0 dBFS 记 100，一根线性的分贝轴，不做任何校准 —— 教室里的「安静」
 * 与「吵闹」正好落在这一段的中间，这就是它唯一的用处。
 */
export function levelOf(samples) {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of samples) {
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples.length);
  if (rms <= 0) {
    return 0;
  }
  const decibels = 20 * Math.log10(rms);
  return clampLevel(decibels + 100);
}

/**
 * 把阈值收进能调的范围，并对齐到刻子上。
 *
 * 值可能来自表里的一格（空着、写了个「吵」、或者干脆没这一列），所以这里把「不是个数」
 * 一律兜成默认值 —— 与其让 `NaN` 一路漏到后面，不如在这里定下来。空着的那一格也算
 * 「不是个数」：`Number('')` 是 0，不特判的话会读成下限 30，那像个悄悄改过的设置。
 */
export function clampThreshold(value) {
  const number = value === null || value === undefined || value === '' ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) {
    return THRESHOLD_DEFAULT;
  }
  const snapped = Math.round(number / THRESHOLD_STEP) * THRESHOLD_STEP;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, snapped));
}

/**
 * 越界与回落。
 *
 * 界面每读到一个数就喂进 [`push`]，用它返回的「该提醒了」去响，用 [`isOver`] 去上色。
 * 阈值随时能改，改的那一刻当场重判。
 */
export class VolumeWatch {
  #threshold;
  #level = 0;
  #seen = false;
  #rise = 0;
  #fallFrom = null;
  #over = false;
  #overSince = null;
  #alerted = false;

  constructor(threshold = THRESHOLD_DEFAULT) {
    this.#threshold = clampThreshold(threshold);
  }

  get threshold() {
    return this.#threshold;
  }

  set threshold(value) {
    const next = clampThreshold(value);
    if (next === this.#threshold) {
      return;
    }
    this.#threshold = next;
    // 阈值一动就重新起判。还拖着旧阈值立起来的那个「吵」，会出现「阈值调高了
    // 屏幕上还在红着」—— 老师看到的与他自己刚调的对不上。
    this.#rise = 0;
    this.#settle();
  }

  /** 平滑过的读数。界面上摆的是这个。 */
  get level() {
    return Math.round(this.#level);
  }

  /** 现在算不算「吵着」。 */
  get isOver() {
    return this.#over;
  }

  /**
   * 读一个数。返回「这会儿该提醒一声」——
   *
   * 只有吵着没停满 [`ALERT_HOLD_MS`] 的那一拍为真。一次吵只真一次，静下来之后再吵
   * 才算新的一次。
   */
  push(value, at) {
    const level = Math.min(LEVEL_CEILING, Math.max(0, value));
    // 平滑在浮点上做，取整只在读出去的时候 —— 每拍都取整会把小数一路磨掉，
    // 读数就停在原地不动了
    this.#level = this.#seen ? this.#level + (level - this.#level) * SMOOTH_FACTOR : level;
    this.#seen = true;

    if (level >= this.#threshold) {
      this.#fallFrom = null;
      this.#rise += 1;
      if (!this.#over && this.#rise >= RISE_FRAMES) {
        this.#over = true;
        this.#overSince = at;
        this.#alerted = false;
      }
    } else {
      this.#rise = 0;
      if (this.#over) {
        if (level > this.#threshold - HYSTERESIS) {
          // 就在阈值下面一点。还不到说「静下来了」的时候
          this.#fallFrom = null;
        } else {
          this.#fallFrom ??= at;
          if (at - this.#fallFrom >= FALL_HOLD_MS) {
            this.#settle();
          }
        }
      }
    }

    if (!this.#over || this.#alerted || at - this.#overSince < ALERT_HOLD_MS) {
      return false;
    }
    this.#alerted = true;
    return true;
  }

  /** 不读了。下一趟重开时不该带着上一趟的样子。 */
  reset() {
    this.#level = 0;
    this.#seen = false;
    this.#rise = 0;
    this.#fallFrom = null;
    this.#settle();
  }

  /** 静下来了。回落途中那些记账一起清掉。 */
  #settle() {
    this.#over = false;
    this.#overSince = null;
    this.#alerted = false;
    this.#fallFrom = null;
  }
}
