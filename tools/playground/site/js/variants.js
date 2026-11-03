// 变体 = 一棵布局树 + 一张「槽位 → 面板」映射表。
// 面板不知道自己在哪，间距不由面板画，全部由 split 节点决定。
// 新增变体只加一条记录，不动任何面板代码。
//
// fixed 是「这个部位不跟着栅格走」：预览列按设计稿定宽，日志按设计稿定高。

const slot = (id, fixed) => ({ type: "slot", id, fixed });
const split = (dir, a, b, ratio = 0.5) => ({ type: "split", dir, ratio, children: [a, b] });

export const VARIANTS = {
  // 单栏编辑：无运行器时的 code 条目
  "L-code": {
    tree: slot("editor"),
    panels: { editor: "editor" },
  },
  // 编辑 / 日志 | 预览：有运行器的 code 条目
  "L-code-preview": {
    tree: split(
      "row",
      split("col", slot("editor"), slot("console", 220), 0.746),
      slot("preview", 480),
    ),
    panels: { editor: "editor", console: "console", preview: "preview" },
  },
  // 单栏文档：doc 条目，面板没有面板头
  "L-doc": {
    tree: slot("doc"),
    panels: { doc: "doc-render" },
  },
  // 题目 | （编辑 / 日志）| 预览：exercise 条目
  "L-exercise": {
    tree: split(
      "row",
      slot("problem", 300),
      split(
        "row",
        split("col", slot("editor"), slot("console", 200), 0.7),
        slot("preview", 380),
      ),
    ),
    panels: {
      problem: "doc-render",
      editor: "editor",
      console: "console",
      preview: "preview",
    },
  },
};

// 条目类型决定变体；code 再按运行器在两种形态里取一个。
// 条目上的 runner 覆盖语言默认，用来让同一门语言里也能演示降级。
export function variantOf(entry, language) {
  if (entry.layout) return entry.layout;
  if (entry.kind === "doc") return "L-doc";
  if (entry.kind === "exercise") return "L-exercise";
  return (entry.runner ?? language.runner) === "none" ? "L-code" : "L-code-preview";
}
