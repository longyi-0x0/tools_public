/** 文件名与标识符规范化（04 §2.4 的 identify 规则；B/C 共用，保证「可编译」第一道保证）。 */

/** TS 保留字：命中就前缀 `_`（04 §2.4）。 */
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'as', 'implements', 'interface', 'let', 'package',
  'private', 'protected', 'public', 'static', 'yield', 'any', 'boolean', 'constructor', 'declare',
  'get', 'module', 'require', 'number', 'set', 'string', 'symbol', 'type', 'from', 'of', 'async',
  'await', 'unknown', 'never', 'readonly', 'keyof', 'infer', 'is', 'asserts', 'namespace',
]);

export interface Identified {
  name: string;
  /** 被改写过时的原值（写进 `// 原值：`）。 */
  original?: string;
}

/**
 * 中文 / 字母 / 数字 / `_` / `$` 且首字符非数字 → 原样；首字符数字或保留字 → 前缀 `_`；
 * 其余字符逐个换成 `_`，原值进 `original`；规范化后为空或全 `_` → fallback。
 */
export function identify(raw: string, fallback: string): Identified {
  const original = raw.trim();
  let text = '';
  let changed = false;
  for (const char of original) {
    if (/[\p{L}\p{N}_$]/u.test(char)) text += char;
    else {
      text += '_';
      changed = true;
    }
  }
  if (text === '' || /^_+$/.test(text)) return { name: fallback };
  if (/^\p{N}/u.test(text)) {
    text = `_${text}`;
    changed = true;
  }
  if (RESERVED.has(text)) {
    text = `_${text}`;
    changed = true;
  }
  return changed ? { name: text, original } : { name: text };
}

/** 同名冲突：保留首个，其余 `<名>_<序号>` 并注「重名」（04 §2.4）。 */
export function uniqueIn(base: string, used: Set<string>): { name: string; duplicate: boolean } {
  if (!used.has(base)) {
    used.add(base);
    return { name: base, duplicate: false };
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  const name = `${base}_${index}`;
  used.add(name);
  return { name, duplicate: true };
}

/** 文件名用的安全基名：去掉 Windows 文件名禁用字符与空白段。 */
export function safeFileBase(name: string): string {
  const text = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text === '' ? '未命名工作区' : text;
}

export function workspaceBase(name: string): string {
  return safeFileBase(name);
}
