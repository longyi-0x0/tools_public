// 占位运行器：只把能直接在浏览器里跑的东西拼成一份文档，交给预览面板的 iframe。
// 跑不了的（runner 为 none，或语言没有编译环节）一律返回 unsupported，由面板明示未接入，
// 不用空壳冒充已支持。

const BRIDGE = `<script>
(function () {
  var send = function (level, args) {
    parent.postMessage({ source: "playground-preview", level: level, text: args.map(String).join(" ") }, "*");
  };
  ["log", "info", "warn", "error"].forEach(function (k) {
    var origin = console[k];
    console[k] = function () {
      var args = [].slice.call(arguments);
      send(k === "info" ? "log" : k, args);
      origin.apply(console, args);
    };
  });
  window.addEventListener("error", function (e) { send("error", [e.message]); });
})();
<\/script>`;

function escapeForScript(text) {
  return text.replace(/<\/script>/gi, "<\\/script>");
}

export function buildDoc(files, language) {
  if (language.runner === "none") {
    return { status: "unsupported", reason: `${language.label} 运行器未接入（not_implemented）` };
  }
  if (!language.compile) {
    return { status: "unsupported", reason: `${language.label} 编译未接入（not_implemented）` };
  }

  const html = files.find((f) => /\.html?$/i.test(f.name));
  const scripts = files.filter((f) => /\.(js|mjs)$/i.test(f.name));
  if (!html && scripts.length === 0) {
    return { status: "unsupported", reason: "没有可执行的入口文件" };
  }

  const body = html ? html.content : "";
  const tags = scripts
    .map((f) => `<script>${escapeForScript(f.content)}<\/script>`)
    .join("\n");

  return {
    status: "ok",
    doc: `<!DOCTYPE html><html><head><meta charset="utf-8">${BRIDGE}</head><body>${body}\n${tags}</body></html>`,
  };
}
