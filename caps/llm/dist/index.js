/**
 * `llm.chat`：发一次对话，交出文本。
 *
 * **直连 LiteLLM，不经过 `toolbox_service`。** 端点与 master key 就写在这份代码
 * 里，而它是发布产物——`releases/tools_public/<版本>/caps/llm/index.js` 谁都能
 * 下载到，两份凭据因此等于公开。这是**临时形态**，先让工具能用起来：
 *
 * 收口时改成 `ctx.call("llm.chat", …)` 由服务端持 key 代发、按用户记账与限流，
 * 这一份包只剩「怎么把请求发出去、流式怎么读」这一层，代码不用重写。
 *
 * 两处与上游有关的脾气，写在这里免得每个工具各踩一遍：
 *
 * - 上游模型**默认开思考**：`reasoning_content` 先出来，思考 token 计入
 *   `completion_tokens`。工具里多数是短任务，本包**默认关掉**；真要推理显式
 *   传 `thinking: "auto"`。
 * - 上游最小实例是 0：缩容之后第一次请求要把容器拉起来，几十秒是常态，所以
 *   默认超时给到 90 秒。工具界面上第一次点下去要给用户一句「正在叫醒」。
 *
 * 写成 ES 模块、不经过打包器：这是发布产物，直接 `export function create`。
 */

const ENDPOINT = "https://litellm-322487-10-1309443421.sh.run.tcloudbase.com";
const MASTER_KEY = "sk-793a4fcb5579823d1958e6e9a03be1334ab6af0b90995828";
const MODEL = "deepseek-flash";
/** 覆盖到「响应头回来」为止；流式开始之后不再掐表。 */
const DEFAULT_TIMEOUT_MS = 90000;

/** 调用没成功。带 HTTP 状态与上游回的那一段原文，界面上可以直接摆出来。 */
export class LlmError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LlmError";
    this.status = options.status ?? 0;
    this.body = options.body ?? "";
  }
}

/**
 * 一个包给一个能力：`llm.chat` 同时给三种用法，共用同一份「请求怎么拼、
 * 错误怎么翻译」的代码。壳只 import 一次。
 *
 * @returns {{ "llm.chat": { model: string, text: Function, stream: Function, raw: Function } }}
 */
export function create() {
  return {
    "llm.chat": {
      /** 不传 `model` 时用哪一个。 */
      model: MODEL,

      /**
       * 要一段文本。最简单的那一种用法。
       *
       * @param {Array<{role: string, content: string}>} messages
       * @param {{model?: string, maxTokens?: number, temperature?: number,
       *          thinking?: "auto" | "off", signal?: AbortSignal, timeoutMs?: number}} [options]
       * @returns {Promise<string>}
       */
      async text(messages, options = {}) {
        const data = await once(messages, options);
        const content = data?.choices?.[0]?.message?.content;
        return typeof content === "string" ? content : "";
      },

      /**
       * 流式要一段文本：每来一片就回调一次，最后把整段还回来。
       *
       * `onDelta` 只给**正文**，思考过程不给——默认关思考时本来也没有；开了
       * 思考时要看过程就用 [`raw`] 自己解。
       *
       * @param {Array<{role: string, content: string}>} messages
       * @param {{onDelta?: (piece: string) => void} & Record<string, unknown>} [options]
       * @returns {Promise<string>}
       */
      stream: asStream,

      /**
       * 要把上游回的整个对象（含 `usage` 与 `reasoning_content`）。其余两个都是
       * 在它外面剥了一层。
       *
       * @param {Array<{role: string, content: string}>} messages
       * @param {Record<string, unknown>} [options]
       * @returns {Promise<Record<string, unknown>>}
       */
      raw: once,
    },
  };
}

/**
 * 流式：每来一片回调一次，最后把整段还回来。
 *
 * `onDelta` 只给正文，不给思考过程——默认关思考时本来也没有；开了思考要
 * 看过程就直接用 [`once`] 拿 `reasoning_content`。
 */
async function asStream(messages, options = {}) {
  const onDelta = typeof options.onDelta === "function" ? options.onDelta : null;
  const response = await post(requestBody(messages, options, true), options);
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new LlmError("上游没有返回可读的流：先别用 stream，退回 text");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let collected = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    // 最后一段可能只收到了半帧，留在下一轮再拼。
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const payload = frameData(frame);
      if (payload === null) {
        continue;
      }
      if (payload === "[DONE]") {
        return collected;
      }
      let event;
      try {
        event = JSON.parse(payload);
      } catch {
        continue; // 心跳与注释行：不参与正文
      }
      const piece = event?.choices?.[0]?.delta?.content;
      if (typeof piece === "string" && piece !== "") {
        collected += piece;
        if (onDelta !== null) {
          onDelta(piece);
        }
      }
    }
  }
  return collected;
}

/** 非流式：上游回的整个对象原样交出去。 */
async function once(messages, options = {}) {
  const response = await post(requestBody(messages, options, false), options);
  return response.json();
}

/** 拼请求体。流式与非流式只差一个 `stream` 字段。 */
function requestBody(messages, options, stream) {
  return {
    model: typeof options.model === "string" ? options.model : MODEL,
    messages,
    stream,
    ...(typeof options.maxTokens === "number" ? { max_tokens: options.maxTokens } : {}),
    ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    // 上游默认开思考，这里默认关：工具里的活多是短活，思考 token 也是钱。
    thinking: { type: options.thinking === "auto" ? "enabled" : "disabled" },
  };
}

/**
 * 发一次请求。**令牌只在这里出现一次。**
 *
 * 超时只掐到响应头：流式一旦开始，读多久由调用方自己用 `signal` 决定。
 */
async function post(body, options) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const outer = options.signal;
  if (outer instanceof AbortSignal) {
    outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(`${ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MASTER_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new LlmError(`模型调用失败（HTTP ${response.status}）`, {
        status: response.status,
        body: text.slice(0, 300),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof LlmError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      const cancelled = outer instanceof AbortSignal && outer.aborted;
      throw new LlmError(
        cancelled ? "调用被取消" : `${Math.round(timeoutMs / 1000)} 秒没有等到响应：上游可能正在冷启动`,
      );
    }
    throw new LlmError(`调用没有送达：${messageOf(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 一帧 SSE 里的 `data:` 那一段。非 data 行（心跳、注释）返回 null。 */
function frameData(frame) {
  for (const line of frame.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(":")) {
      continue;
    }
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    return trimmed.slice(5).trim();
  }
  return null;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
