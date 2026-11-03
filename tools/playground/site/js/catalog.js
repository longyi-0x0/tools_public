// 占位目录。内容全是示意，编排目标是让右侧四种布局变体一次都能演示到：
//
//   环境说明（doc）                  → L-doc           单栏文档，无面板头
//   第一个程序（code，有 runner）    → L-code-preview  编辑 | 预览
//   多文件示例（code，两个文件）     → L-code-preview  编辑区上方出现 tabs
//   纯片段（code，runner: none）     → L-code          单栏编辑，演示降级
//   泛型约束练习（exercise）         → L-exercise      题目 | 编辑+日志 | 预览
//
// 切到 Python 时，同类的 code 条目因为语言 runner 为 none 会从双栏退成单栏，
// 用来演示「变体随语言变化」；JavaScript 的「计数器」是真能跑的一条，
// 用来演示日志面板真的接到了 iframe 里的 console。

export const LANGUAGES = [
  { id: "ts", label: "TypeScript", short: "ts", runner: "browser", compile: null },
  { id: "js", label: "JavaScript", short: "js", runner: "browser", compile: "identity" },
  { id: "py", label: "Python", short: "py", runner: "none", compile: null },
];

export const CATALOGS = {
  ts: [
    {
      id: "ts-basic",
      title: "入门",
      entries: [
        {
          id: "ts-env",
          title: "环境说明",
          kind: "doc",
          body: `# 环境说明

这一节是**占位内容**，只用来演示右侧的文档形态。

- 文档条目没有编辑区，所以也没有运行按钮
- 文档面板没有面板头，靠内容自己的排版呼吸
- 点开左边别的条目，可以看到右侧换成别的形态

围栏代码也支持：

\`\`\`ts
const answer: number = 42;
\`\`\`

占位结束。`,
        },
        {
          id: "ts-hello",
          title: "第一个程序",
          kind: "code",
          files: [
            {
              id: "index.ts",
              name: "index.ts",
              content: `// 占位：TypeScript 编译未接入，预览面板会明示未接入。
function greet(name: string): string {
  return "Hello, " + name;
}

console.log(greet("playground"));`,
            },
          ],
        },
      ],
    },
    {
      id: "ts-advanced",
      title: "进阶",
      entries: [
        {
          id: "ts-multi",
          title: "多文件示例",
          kind: "code",
          files: [
            {
              id: "index.ts",
              name: "index.ts",
              content: `import { repeat } from "./util";

console.log(repeat("占位", 3));`,
            },
            {
              id: "util.ts",
              name: "util.ts",
              content: `export function repeat(text: string, times: number): string[] {
  return Array.from({ length: times }, () => text);
}`,
            },
          ],
        },
        {
          id: "ts-snip",
          title: "纯片段（不运行）",
          kind: "code",
          // 条目级 runner 覆盖语言默认：同一门语言里也能看到降级成单栏
          runner: "none",
          files: [
            {
              id: "snippet.ts",
              name: "snippet.ts",
              content: `// 这条声明了 runner: none，所以只有单栏编辑区，
// 用来和同语言的「第一个程序」对照。
export type Id = string | number;`,
            },
          ],
        },
      ],
    },
    {
      id: "ts-drill",
      title: "练习",
      entries: [
        {
          id: "ts-ex",
          title: "泛型约束练习",
          kind: "exercise",
          problem: `# 泛型约束练习

让 \`pick\` 只接受一个对象和它自己的键，返回对应的值。

- 键必须约束成 \`keyof T\`
- 返回值类型跟着键走
- 约束写错时应当在编译期报错

占位题面，不判题。`,
          files: [
            {
              id: "solve.ts",
              name: "solve.ts",
              content: `// 占位：把约束补上，让它只接受对象已有的键。
export function pick(obj, key) {
  return obj[key];
}`,
            },
          ],
        },
      ],
    },
  ],

  js: [
    {
      id: "js-basic",
      title: "入门",
      entries: [
        {
          id: "js-env",
          title: "环境说明",
          kind: "doc",
          body: `# 环境说明

占位。JavaScript 这一支的「计数器」是真能跑的一条：点编辑区面板头的「运行」，
右下预览出页面，右侧中间的日志会接住 iframe 里的 \`console.log\`。`,
        },
        {
          id: "js-count",
          title: "计数器",
          kind: "code",
          files: [
            {
              id: "index.html",
              name: "index.html",
              content: `<div style="font:14px system-ui;padding:16px">
  <p>计数：<b id="n">0</b></p>
  <button id="add">加一</button>
</div>`,
            },
            {
              id: "app.js",
              name: "app.js",
              content: `var n = 0;
var out = document.getElementById("n");
document.getElementById("add").addEventListener("click", function () {
  n += 1;
  out.textContent = String(n);
  console.log("计数", n);
});`,
            },
          ],
        },
      ],
    },
    {
      id: "js-drill",
      title: "练习",
      entries: [
        {
          id: "js-ex",
          title: "事件绑定练习",
          kind: "exercise",
          problem: `# 事件绑定练习

让按钮每次点击把计数加一，并把值写回页面。

- 用 \`addEventListener\`，不要内联 \`onclick\`
- 每次点击往控制台打一条日志

占位题面，不判题。`,
          files: [
            {
              id: "app.js",
              name: "app.js",
              content: `// 占位：把事件绑上。
console.log("待实现");`,
            },
          ],
        },
      ],
    },
  ],

  py: [
    {
      id: "py-basic",
      title: "入门",
      entries: [
        {
          id: "py-env",
          title: "环境说明",
          kind: "doc",
          body: `# 环境说明

占位。Python 的 \`runner\` 是 \`none\`，所以这一支里的 code 条目
会降级成**单栏编辑**——和 TypeScript 的同名条目对照着看，最直观。`,
        },
        {
          id: "py-hello",
          title: "第一个程序",
          kind: "code",
          files: [
            {
              id: "main.py",
              name: "main.py",
              content: `# 占位：Python 运行器未接入，这一条只有单栏编辑区。
def greet(name):
    return "Hello, " + name

print(greet("playground"))`,
            },
          ],
        },
      ],
    },
    {
      id: "py-drill",
      title: "练习",
      entries: [
        {
          id: "py-ex",
          title: "列表推导练习",
          kind: "exercise",
          problem: `# 列表推导练习

把嵌套列表摊平，并去掉重复项，保持原有顺序。

占位题面，不判题。练习形态仍是三栏，
但预览面板会明示「Python 运行器未接入」。`,
          files: [
            {
              id: "solve.py",
              name: "solve.py",
              content: `# 占位：把 flatten 写完。
def flatten(rows):
    return rows`,
            },
          ],
        },
      ],
    },
  ],
};

export function findEntry(languageId, entryId) {
  for (const group of CATALOGS[languageId] ?? []) {
    const hit = group.entries.find((e) => e.id === entryId);
    if (hit) return hit;
  }
  return null;
}

export function firstEntry(languageId) {
  return CATALOGS[languageId]?.[0]?.entries?.[0] ?? null;
}
