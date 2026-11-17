/**
 * 持久化（04 §3）：落盘只由这里做，组件里不写 storage。
 * 键：problem-domain-canvas:workspace:v2 / :workspace:backup:v2 / :session:v1。
 * 读兜底链：主键 → backup → 空工作区；读不出来就丢，不半打开。
 */
import type { Domain, Workspace } from '../domain/types.ts';
import { createWorkspace } from '../domain/factory.ts';
import { migrate } from '../domain/migrate.ts';
import { withDefaults } from '../domain/normalize.ts';
import { parseJson, stableStringify } from '../domain/serialize.ts';
import { STORAGE_KEYS, type StorageLike } from './storage.ts';
import { debounce } from '../util/throttle.ts';

export interface LoadedWorkspace {
  ws: Workspace;
  warnings: string[];
  source: 'storage' | 'backup' | 'empty';
}

export function loadWorkspaceText(
  text: string | null,
): { ws: Workspace; warnings: string[] } | { error: string } {
  if (!text) return { error: '没有存储内容' };
  const parsed = parseJson(text);
  if (parsed === null) return { error: '存储内容不是合法 JSON' };
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record['nodes']) || !Array.isArray(record['edges'])) {
    return { error: '不是本工具的文档形态（缺 nodes/edges 数组）' };
  }
  const migrated = migrate(parsed);
  if ('error' in migrated) return { error: migrated.error };
  return { ws: withDefaults(migrated.ws as Workspace), warnings: migrated.warnings };
}

export function loadWorkspace(storage: StorageLike): LoadedWorkspace {
  const attempts: Array<{ key: string; source: 'storage' | 'backup' }> = [
    { key: STORAGE_KEYS.workspace, source: 'storage' },
    { key: STORAGE_KEYS.backup, source: 'backup' },
  ];
  const warnings: string[] = [];
  for (const attempt of attempts) {
    const raw = storage.getItem(attempt.key);
    if (!raw) continue;
    const loaded = loadWorkspaceText(raw);
    if ('error' in loaded) {
      warnings.push(`${attempt.source} 读不出来（${loaded.error}），已跳过`);
      continue;
    }
    return { ws: loaded.ws, warnings: [...warnings, ...loaded.warnings], source: attempt.source };
  }
  return { ws: withDefaults(createWorkspace()), warnings, source: 'empty' };
}

export interface SessionState {
  domain: Domain;
  selectedId: string | null;
  theme: 'light' | 'dark';
  canvasOpen: boolean;
  detailOpen: boolean;
  ignoredChecks: string[];
}

export const DEFAULT_SESSION: SessionState = {
  domain: 'problem',
  selectedId: null,
  theme: 'light',
  canvasOpen: true,
  detailOpen: true,
  ignoredChecks: [],
};

export function loadSession(storage: StorageLike): SessionState {
  const parsed = parseJson(storage.getItem(STORAGE_KEYS.session) ?? '');
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SESSION };
  const raw = parsed as Record<string, unknown>;
  const domain: Domain = raw['domain'] === 'solve' ? 'solve' : 'problem';
  const theme = raw['theme'] === 'dark' ? 'dark' : 'light';
  return {
    domain,
    selectedId: typeof raw['selectedId'] === 'string' ? raw['selectedId'] : null,
    theme,
    canvasOpen: raw['canvasOpen'] !== false,
    detailOpen: raw['detailOpen'] !== false,
    ignoredChecks: Array.isArray(raw['ignoredChecks'])
      ? (raw['ignoredChecks'] as string[]).filter((item) => typeof item === 'string')
      : [],
  };
}

export function saveSession(storage: StorageLike, session: SessionState): void {
  try {
    storage.setItem(STORAGE_KEYS.session, stableStringify(session));
  } catch {
    /* 会话态丢了不影响文档正文（04 §3.1）。 */
  }
}

export interface WorkspacePersister {
  schedule(): void;
  flush(): void;
  /** 保存失败后的「点击重试」：清掉只读降级，再写一次（03 §112 第三态）。 */
  retry(): void;
  dispose(): void;
  isReadOnly(): boolean;
}

/**
 * 文档落盘：300ms 防抖 / 2000ms maxWait；写前把旧值挪进 backup 键；
 * 先 stableStringify 再和上次写过的文本全等比较（不靠 dirty 标志）；单键单次写。
 * 配额不足按序回收 backup → session → 只读降级（04 §3.6）。
 */
export function createWorkspacePersister(options: {
  storage: StorageLike;
  read: () => string;
  onSaved?: () => void;
  onReadOnly?: (reason: string) => void;
  /** 写盘失败上报（03 §112：StatusBar 第三态 + 点击重试）；不再静默吞掉。 */
  onSaveFailed?: (reason: string) => void;
}): WorkspacePersister {
  let lastWrittenText = options.storage.getItem(STORAGE_KEYS.workspace) ?? '';
  let readOnly = false;

  const write = (text: string): void => {
    const previous = options.storage.getItem(STORAGE_KEYS.workspace);
    if (previous && previous !== text) {
      options.storage.setItem(STORAGE_KEYS.backup, previous);
    }
    options.storage.setItem(STORAGE_KEYS.workspace, text);
  };

  const flush = (): void => {
    if (readOnly) return;
    const text = options.read();
    if (text === lastWrittenText) return;
    try {
      write(text);
      lastWrittenText = text;
      options.onSaved?.();
      return;
    } catch {
      // 配额超限：先删 backup、再删 session，再写一次（04 §3.6）。
      try {
        options.storage.removeItem(STORAGE_KEYS.backup);
        options.storage.removeItem(STORAGE_KEYS.session);
        write(text);
        lastWrittenText = text;
        options.onSaved?.();
        return;
      } catch (second) {
        const reason = second instanceof Error ? second.message : String(second);
        readOnly = true;
        // 先上报失败（StatusBar 显示可点重试），再降级只读提示（04 §3.6 不删）。
        options.onSaveFailed?.(`写到本机存储失败：${reason}`);
        options.onReadOnly?.(`本机存储写入失败，已停止自动保存（${reason}）`);
      }
    }
  };

  const debounced = debounce(flush, 300, 2000);

  return {
    schedule: () => {
      if (!readOnly) debounced();
    },
    flush: () => debounced.flush(),
    retry: () => {
      readOnly = false;
      flush();
    },
    dispose: () => debounced.cancel(),
    isReadOnly: () => readOnly,
  };
}

/** session 落盘 800ms 防抖，失败静默（04 §3.1）。 */
export function createSessionPersister(
  storage: StorageLike,
  read: () => SessionState,
): { schedule(): void; flush(): void } {
  const flush = (): void => saveSession(storage, read());
  const debounced = debounce(flush, 800, 2400);
  return { schedule: debounced, flush: () => debounced.flush() };
}
