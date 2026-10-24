/**
 * 麦克风：只读教室的响度，波形出不了这个模块。
 *
 * 读到的每一截波形都在这里变成 0–100 的一个数，随即丢掉 —— 不存、不传。老师关掉或自习
 * 结束时 `close()` 会把麦克风真的放手（浏览器右上角那个录音指示灯灭掉），不是只停下读数。
 *
 * 自动增益、降噪、回声消除三样都关掉：开着的话，「教室安静下来了」与「机器把声音压下去
 * 了」在这个数上分不出来，而这个数要的正是教室自己。关不掉时（装置不认这几条）退回裸的
 * `{ audio: true }`，不因为它听不成就不让老师用。
 */

import { READING_PERIOD_MS, levelOf } from './volume.js';

/** 开不了麦克风的三种情形。三种要说三句不同的话 —— 合成一句「出错了」，老师就不知道
 *  是插个麦克风能好、还是要去系统的隐私设置里放行。 */
export const MIC_TROUBLE = {
  /** 一个输入装置都没有。插上就好。 */
  NO_DEVICE: 'noDevice',
  /** 没给权限。去系统的隐私设置里放行。 */
  DENIED: 'denied',
  /** 装置在、权限也有，就是开不了。多半是别的程序正占着。 */
  UNAVAILABLE: 'unavailable',
};

/**
 * 一拍里读几个小段。
 *
 * 一次 `getFloatTimeDomainData` 拿到的是刚过去的那一小截（2048 个样本，约 43 毫秒），
 * 而读数是 100 毫秒一拍 —— 一拍只读一次的话，两拍之间有缝，教室里的短促一声正好落在缝
 * 里就没了。所以一拍里读四小段（相邻两段是叠着的，不漏），取这四段的**峰**当这一拍。
 * 「取峰」而不是「取平均」：老师要管的就是那一声喊，平均会把它抹平。
 */
const SLICES_PER_READING = 4;

let context = null;
let stream = null;
let source = null;
let analyser = null;
let timer = 0;
let buffer = null;

let peak = 0;
let sliceIndex = 0;

/**
 * 这台浏览器能不能听。
 *
 * `getUserMedia` 要求安全上下文：`https://` 或本机（`localhost` / `127.0.0.1`）。教室里
 * 用内网地址（`http://192.168.x.x`）打开的页面上，这个接口根本不存在 —— 跟语音识别是同
 * 一条限制，所以话也要说成同一句。
 */
export function availability() {
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return { ok: false, reason: '这个浏览器不支持麦克风' };
  }
  if (window.isSecureContext === false) {
    return { ok: false, reason: '需通过 https 打开（本机 localhost 亦可）' };
  }
  return { ok: true, reason: '' };
}

/** 现在是不是正听着。 */
export function isListening() {
  return stream !== null;
}

function troubleOf(error) {
  switch (error?.name) {
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return MIC_TROUBLE.NO_DEVICE;
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return MIC_TROUBLE.DENIED;
    default:
      return MIC_TROUBLE.UNAVAILABLE;
  }
}

/** 开不了时，跟老师说清「那你该动哪儿」。 */
export function explainTrouble(trouble) {
  switch (trouble) {
    case MIC_TROUBLE.NO_DEVICE:
      return '未检测到麦克风，接入后即可使用';
    case MIC_TROUBLE.DENIED:
      return '未获得麦克风权限，请在地址栏左侧的锁形图标中允许';
    default:
      return '麦克风无法打开，可能被其他程序占用';
  }
}

/**
 * 开始听。
 *
 * `input.onLevel(level, at)` 每 100 毫秒收一拍（`at` 是毫秒时间戳）；
 * `input.onLost()` 在听着的过程中被掐断（老师撤了权限、装置被拔掉）时叫一次。
 *
 * 返回「开没开成」。开不成时 `trouble` 说是哪一种。
 */
export async function start(input) {
  close();
  const can = availability();
  if (!can.ok) {
    return { ok: false, trouble: MIC_TROUBLE.UNAVAILABLE, reason: can.reason };
  }

  const constraints = {
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    },
  };
  let media = null;
  try {
    media = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (error?.name === 'OverconstrainedError') {
      // 装置不认那三条约束。裸着再要一次 —— 宁可带点机器的加工，也别让它听不成
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (retry) {
        return { ok: false, trouble: troubleOf(retry) };
      }
    } else {
      return { ok: false, trouble: troubleOf(error) };
    }
  }

  const ContextClass = window.AudioContext ?? window.webkitAudioContext ?? null;
  if (ContextClass === null) {
    for (const track of media.getTracks()) {
      track.stop();
    }
    return { ok: false, trouble: MIC_TROUBLE.UNAVAILABLE, reason: '这个浏览器不支持音频' };
  }

  try {
    context = new ContextClass();
    // 自动播放策略下 context 出生是挂起的，挂着的分析节点读出来全是零 ——
    // 老师按那颗钮就是一次手势，正好在这里唤醒
    if (context.state === 'suspended') {
      await context.resume();
    }
    const sourceNode = context.createMediaStreamSource(media);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    // 只连到分析节点，不连 destination：连了就等于把教室的声音从扬声器放出来，直接回授
    sourceNode.connect(analyser);
    source = sourceNode;
  } catch {
    for (const track of media.getTracks()) {
      track.stop();
    }
    close();
    return { ok: false, trouble: MIC_TROUBLE.UNAVAILABLE };
  }

  stream = media;
  buffer = new Float32Array(analyser.fftSize);
  peak = 0;
  sliceIndex = 0;

  for (const track of media.getTracks()) {
    track.addEventListener('ended', () => {
      if (stream !== null) {
        close();
        input.onLost?.();
      }
    });
  }

  timer = window.setInterval(() => {
    if (analyser === null) {
      return;
    }
    analyser.getFloatTimeDomainData(buffer);
    const level = levelOf(buffer);
    if (level > peak) {
      peak = level;
    }
    sliceIndex += 1;
    if (sliceIndex < SLICES_PER_READING) {
      return;
    }
    const reading = peak;
    peak = 0;
    sliceIndex = 0;
    input.onLevel(reading, Date.now());
  }, READING_PERIOD_MS / SLICES_PER_READING);

  return { ok: true, trouble: null };
}

/**
 * 不听了。
 *
 * 把轨道停掉，不是只清掉本地引用 —— 停掉才是真的放开麦克风（指示灯灭、别的程序能用）。
 *
 * **先把引用放下再停轨道**：`track.stop()` 有可能当场回调到 `ended` 上（装置自己断了就是
 * 这条路），那时若还看得见 `stream`，就会再进来一次、再停一次，一路递归到栈满。放下的
 * 顺序也让它成为幂等的：连叫两次，第二次什么也不做。
 */
export function close() {
  window.clearInterval(timer);
  timer = 0;
  const media = stream;
  const sourceNode = source;
  const analyserNode = analyser;
  const contextNode = context;
  stream = null;
  source = null;
  analyser = null;
  context = null;
  buffer = null;
  peak = 0;
  sliceIndex = 0;

  if (sourceNode !== null) {
    sourceNode.disconnect();
  }
  if (analyserNode !== null) {
    analyserNode.disconnect();
  }
  if (media !== null) {
    for (const track of media.getTracks()) {
      track.stop();
    }
  }
  if (contextNode !== null) {
    void contextNode.close();
  }
}
