/**
 * 超时提示音。
 *
 * 用 WebAudio 现场合成一段三连「叮 · 咚 · 叮」，不引音频文件 —— 工具页是
 * 静态页，多一个二进制文件就多一份加载与缓存要照看，而老师要的只是一声听得见
 * 的提醒。
 *
 * 浏览器的自动播放策略：`AudioContext` 出生时是挂起的，必须在一次用户手势里
 * 唤醒。所以老师按下「开始记录」那一下就会 `unlock()`，之后自习期间的自动
 * 提示音才响得出来。
 */

let context = null;

function audioContextClass() {
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

/** 在用户手势里调一次，之后定时器也能发声。 */
export function unlock() {
  const Class = audioContextClass();
  if (Class === null) {
    return;
  }
  if (context === null) {
    context = new Class();
  }
  if (context.state === 'suspended') {
    void context.resume();
  }
}

/** 现在能不能发声。 */
export function isSupported() {
  return audioContextClass() !== null;
}

function beep(at, frequency, duration) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  // 两头留出淡入淡出，不然每一声的头尾都会「啪」一下
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.28, at + 0.02);
  gain.gain.setValueAtTime(0.28, at + duration - 0.06);
  gain.gain.linearRampToValueAtTime(0, at + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

/**
 * 响一次。
 *
 * 连响三声、音高一路往下 —— 比单音更容易从教室的嘈杂里被听出来。返回一个
 * Promise，在最后一声结束时了结，调用方可以据此做界面上的呼吸效果。
 */
export function playOvertimeAlert() {
  unlock();
  if (context === null) {
    return Promise.resolve(false);
  }
  const now = context.currentTime + 0.02;
  beep(now, 988, 0.18);
  beep(now + 0.22, 784, 0.18);
  beep(now + 0.44, 988, 0.3);
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(true), 800);
  });
}
