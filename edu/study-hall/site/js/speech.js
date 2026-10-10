/**
 * 备注的语音输入。
 *
 * 走浏览器原生的 `SpeechRecognition`（Chrome / Edge 为 `webkitSpeechRecognition`），
 * 语言固定 `zh-CN`。**这是可选增强，不是必需路径**：这套识别在多数实现里要把音频
 * 送到厂商的服务器，国内网络下常常起不来；起不来时界面把麦克风按钮置灰并说明原因，
 * 备注照样能手打或挑模板。
 *
 * 一次识别一段话，说完（引擎自己判定断句）就回调结果，不做连续听写。
 */

function recognitionClass() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** 这台浏览器能不能做语音识别。 */
export function availability() {
  if (recognitionClass() === null) {
    return { ok: false, reason: '这个浏览器没有语音识别接口' };
  }
  if (window.isSecureContext === false) {
    return { ok: false, reason: '语音识别要求页面走 HTTPS' };
  }
  return { ok: true, reason: '' };
}

/**
 * 听一段话。
 *
 * `onResult` 可能被叫多次（引擎会先给中间结果、再给定稿），中间结果的
 * `final` 为 `false`，界面可以先把它显示出来。`onError` 收到的是引擎给的
 * 错误名，`not-allowed` 表示老师没给麦克风权限，`network` 表示连不上识别服务。
 *
 * 返回一个 `stop()`，用来提前收手。
 */
export function listen(input) {
  const Class = recognitionClass();
  if (Class === null) {
    input.onError('unsupported');
    return () => {};
  }

  const recognition = new Class();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let text = '';
    let isFinal = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      text += result[0].transcript;
      if (result.isFinal) {
        isFinal = true;
      }
    }
    input.onResult(text, isFinal);
  };
  recognition.onerror = (event) => input.onError(event.error ?? 'unknown');
  recognition.onend = () => input.onEnd?.();

  try {
    recognition.start();
  } catch (error) {
    input.onError(error instanceof Error ? error.message : 'unknown');
    return () => {};
  }

  return () => {
    try {
      recognition.stop();
    } catch {
      /* 已经停了 */
    }
  };
}
