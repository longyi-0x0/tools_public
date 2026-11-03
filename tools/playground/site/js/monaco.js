// 编辑器内核：vendor 里那份 Monaco（VS Code 的编辑器），不走 CDN。
//
// 只装三样东西：编辑器内核、主题、六种语言的 Monarch 词法。
// 语言服务（补全 / 类型检查 / 校验）一个都没装，所以也没有 web worker ——
// 演练场的定位是「写完点运行看结果」，不是 IDE。

const VS_ROOT = new URL("../vendor/monaco/vs", import.meta.url).href;

// 词法模块文件名 = 语言 id；扩展名只用于把文件映射到语言。
const LANGUAGES = [
  { id: "javascript", extensions: [".js", ".mjs", ".cjs", ".jsx"] },
  { id: "typescript", extensions: [".ts", ".tsx"] },
  { id: "css", extensions: [".css"] },
  { id: "html", extensions: [".html", ".htm"] },
  { id: "markdown", extensions: [".md", ".markdown"] },
  { id: "python", extensions: [".py"] },
];

// 状态条上显示的语言名，和语言 id 区分开：id 给 Monaco，label 给人看。
const LABEL = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  css: "CSS",
  html: "HTML",
  markdown: "Markdown",
  python: "Python",
  plaintext: "纯文本",
};

export const THEME = "playground-dark";

// 设计稿只给了注释、关键字、正文三档色，其余档位在同一色系里补齐。
const THEME_RULES = [
  { token: "", foreground: "C9D1D9" },
  { token: "comment", foreground: "5C6774", fontStyle: "italic" },
  { token: "keyword", foreground: "7EE2B8" },
  { token: "keyword.control", foreground: "7EE2B8" },
  { token: "string", foreground: "E3A008" },
  { token: "string.escape", foreground: "E3A008" },
  { token: "number", foreground: "E3A008" },
  { token: "regexp", foreground: "E3A008" },
  { token: "type", foreground: "7EE2B8" },
  { token: "type.identifier", foreground: "7EE2B8" },
  { token: "identifier", foreground: "C9D1D9" },
  { token: "delimiter", foreground: "8A96A5" },
  { token: "operator", foreground: "8A96A5" },
  { token: "tag", foreground: "7EE2B8" },
  { token: "attribute.name", foreground: "8A96A5" },
  { token: "attribute.value", foreground: "E3A008" },
];

const THEME_COLORS = {
  "editor.background": "#0C0F12",
  "editor.foreground": "#C9D1D9",
  "editorLineNumber.foreground": "#454E5A",
  "editorLineNumber.activeForeground": "#8A96A5",
  "editor.lineHighlightBackground": "#1B2229",
  "editor.lineHighlightBorder": "#00000000",
  "editorCursor.foreground": "#3DDC97",
  "editor.selectionBackground": "#2C4038",
  "editor.inactiveSelectionBackground": "#1B2229",
  "editor.selectionHighlightBackground": "#1B2229",
  "editorIndentGuide.background1": "#1D232A",
  "editorIndentGuide.activeBackground1": "#262D36",
  "editorWidget.background": "#1B2026",
  "editorWidget.border": "#2C333C",
  "editorSuggestWidget.background": "#1B2026",
  "editorHoverWidget.background": "#1B2026",
  "editorHoverWidget.border": "#2C333C",
  "scrollbarSlider.background": "#2C333C66",
  "scrollbarSlider.hoverBackground": "#3A434E99",
  "scrollbarSlider.activeBackground": "#3A434ECC",
  "editorOverviewRuler.border": "#00000000",
};

const loaded = new Map();

function amdRequire(deps) {
  // AMD 的回调是「每个依赖一个实参」，不是数组
  return new Promise((resolve, reject) => {
    window.require(deps, (...modules) => resolve(modules), reject);
  });
}

export function languageOf(fileName) {
  const lower = fileName.toLowerCase();
  const hit = LANGUAGES.find((language) => language.extensions.some((ext) => lower.endsWith(ext)));
  return hit?.id ?? "plaintext";
}

export function labelOf(languageId) {
  return LABEL[languageId] ?? languageId;
}

export async function loadMonaco() {
  if (loaded.has("monaco")) return loaded.get("monaco");

  const pending = (async () => {
    window.require.config({ paths: { vs: VS_ROOT } });
    await amdRequire(["vs/editor/editor.main"]);
    const monaco = globalThis.monaco;

    // 内核不带任何语言定义，词法要自己注册；不注册就只能当纯文本编辑。
    await Promise.all(LANGUAGES.map(async (language) => {
      const [mod] = await amdRequire([`vs/basic-languages/${language.id}/${language.id}`]);
      monaco.languages.register({ id: language.id, extensions: language.extensions });
      monaco.languages.setMonarchTokensProvider(language.id, mod.language);
      monaco.languages.setLanguageConfiguration(language.id, mod.conf);
    }));

    monaco.editor.defineTheme(THEME, {
      base: "vs-dark",
      inherit: true,
      rules: THEME_RULES,
      colors: THEME_COLORS,
    });
    return monaco;
  })();

  loaded.set("monaco", pending);
  return pending;
}
