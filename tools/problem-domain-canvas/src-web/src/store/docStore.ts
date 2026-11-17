/**
 * docStore（04 §5）：唯一写入口是 commitDoc()；每次结构性变更全量重建 index（04 §2.1），
 * 并在**同一 tick** 同步重算检查（04 §6「触发时机」），所以渲染与检查结果恒一致。
 * 撤销栈也在这一层：`commitDoc(reduce, {coalesceKey})` 决定一条记录还是并入上一条。
 * 不 import React —— React 绑定在 ui/useStores.ts。
 */
import type { DocIndex, Workspace } from '../domain/types.ts';
import { buildIndex, withDefaults } from '../domain/normalize.ts';
import { createWorkspace } from '../domain/factory.ts';
import { runChecks, type CheckResult } from '../domain/checks/index.ts';

export interface DocState {
  ws: Workspace;
  index: DocIndex;
  checks: CheckResult;
  rev: number;
  dirty: boolean;
  readOnly: boolean;
  notice: string | null;
  /** 落盘失败原因（03 §112 第三态）；null = 没有未处理的失败。 */
  saveError: string | null;
}

export interface HistoryEntry {
  /** 变更**前**的文档快照。 */
  ws: Workspace;
  label: string;
  coalesceKey?: string;
  /** 最后合并时间（毫秒） */
  at: number;
}

export interface CommitMeta {
  label?: string;
  /** 同一 key 且间隔 < 600ms 的相邻记录并成一条（04 §5）。 */
  coalesceKey?: string;
  at?: number;
}

type Listener = () => void;

const MAX_HISTORY = 10;
const COALESCE_MS = 600;

const listeners = new Set<Listener>();
let state: DocState | null = null;
let history: HistoryEntry[] = [];
let redoStack: Workspace[] = [];

function makeState(ws: Workspace, extra: Partial<DocState> = {}): DocState {
  const index = buildIndex(ws);
  return {
    ws,
    index,
    checks: runChecks(ws, index),
    rev: 0,
    dirty: false,
    readOnly: false,
    notice: null,
    saveError: null,
    ...extra,
  };
}

export function getDocState(): DocState {
  if (!state) state = makeState(withDefaults(createWorkspace()));
  return state;
}

export function subscribeDoc(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function initDoc(ws: Workspace, notice: string | null = null): void {
  state = makeState(ws, { notice });
  history = [];
  redoStack = [];
  emit();
}

/** 一次命令 = 一次 commit = 至多一条撤销记录。返回是否真的改了文档。 */
export function commitDoc(
  reduce: (ws: Workspace) => Workspace,
  meta: CommitMeta = {},
): boolean {
  const current = getDocState();
  const next = reduce(current.ws);
  if (next === current.ws) return false;

  const at = meta.at ?? Date.now();
  const top = history[history.length - 1];
  const coalesced =
    meta.coalesceKey !== undefined &&
    top !== undefined &&
    top.coalesceKey === meta.coalesceKey &&
    at - top.at < COALESCE_MS;

  if (coalesced && top) {
    // 合并：保留最早的 before 快照，只把时间往后推。
    top.at = at;
  } else {
    history.push({ ws: current.ws, label: meta.label ?? '编辑', coalesceKey: meta.coalesceKey, at });
    if (history.length > MAX_HISTORY) history.shift();
  }
  redoStack = [];

  const index = buildIndex(next);
  state = {
    ...current,
    ws: next,
    index,
    checks: runChecks(next, index),
    rev: current.rev + 1,
    dirty: true,
  };
  emit();
  return true;
}

export function undo(): boolean {
  const entry = history.pop();
  if (!entry) return false;
  const current = getDocState();
  redoStack.push(current.ws);
  const index = buildIndex(entry.ws);
  state = {
    ...current,
    ws: entry.ws,
    index,
    checks: runChecks(entry.ws, index),
    rev: current.rev + 1,
    dirty: true,
  };
  emit();
  return true;
}

export function redo(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  const current = getDocState();
  history.push({ ws: current.ws, label: '重做', at: Date.now() });
  if (history.length > MAX_HISTORY) history.shift();
  const index = buildIndex(next);
  state = {
    ...current,
    ws: next,
    index,
    checks: runChecks(next, index),
    rev: current.rev + 1,
    dirty: true,
  };
  emit();
  return true;
}

/** 撤销栈只读快照（测试与工具栏用）。 */
export function getHistoryState(): {
  stack: readonly HistoryEntry[];
  redo: readonly Workspace[];
} {
  return { stack: history, redo: redoStack };
}

export function markSaved(): void {
  const current = getDocState();
  state = { ...current, dirty: false, saveError: null };
  emit();
}

/** 落盘失败（03 §112）：由 persistence 的 onSaveFailed 上报；StatusBar 显示「⚠ 保存失败（点击重试）」。 */
export function setSaveError(reason: string | null): void {
  const current = getDocState();
  state = { ...current, saveError: reason };
  emit();
}

export function setReadOnly(reason: string): void {
  const current = getDocState();
  state = { ...current, readOnly: true, notice: reason };
  emit();
}
