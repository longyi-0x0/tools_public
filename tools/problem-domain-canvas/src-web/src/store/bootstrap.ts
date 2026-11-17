/**
 * 启动（04 §3）：载入 → 迁移 → 规范化 → 建索引；订阅 doc 落盘、订阅 ui 存 session；
 * pagehide / beforeunload / visibilitychange 立即 flush。
 */
import {
  getDocState,
  initDoc,
  markSaved,
  setReadOnly,
  setSaveError,
  subscribeDoc,
} from './docStore.ts';
import {
  createSessionPersister,
  createWorkspacePersister,
  loadSession,
  loadWorkspace,
} from './persistence.ts';
import { getUiState, hydrateUi, sessionOf, subscribeUi } from './uiStore.ts';
import { STORAGE_KEYS, browserStorage, createMemoryStorage } from './storage.ts';
import { stableStringify } from '../domain/serialize.ts';
import { createSeedWorkspace } from '../domain/seed.ts';

/** StatusBar「保存失败（点击重试）」的落点：bootstrap 建好的那个 persister。 */
let currentPersister: { retry(): void } | null = null;

export function retrySave(): void {
  currentPersister?.retry();
}

export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  document.body.dataset['theme'] = getUiState().theme;
}

/** 空工作区不再是一屏空白：本机还没有文档时载入选课种子（`?empty=1` 可看空态）。 */
function wantsEmptyState(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).has('empty');
}

export function bootstrap(): void {
  const storage = browserStorage() ?? createMemoryStorage();
  const loaded = loadWorkspace(storage);
  const ws =
    loaded.source === 'empty' && !wantsEmptyState()
      ? createSeedWorkspace(new Date().toISOString())
      : loaded.ws;
  initDoc(ws, loaded.warnings.length > 0 ? loaded.warnings.join('；') : null);
  hydrateUi(loadSession(storage));
  applyTheme();

  const persister = createWorkspacePersister({
    storage,
    read: () => stableStringify(getDocState().ws),
    onSaved: markSaved,
    onReadOnly: setReadOnly,
    onSaveFailed: setSaveError,
  });
  currentPersister = persister;
  const sessionPersister = createSessionPersister(storage, () => sessionOf(getUiState()));

  subscribeDoc(() => {
    persister.schedule();
  });
  subscribeUi(() => {
    sessionPersister.schedule();
    applyTheme();
  });

  const flushAll = (): void => {
    persister.flush();
    sessionPersister.flush();
  };
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });

  // 别的标签页动了主键：本地不脏就热载（04 §3.3 的简化版，本轮不做冲突框）。
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEYS.workspace) return;
    if (getDocState().dirty) return;
    const reloaded = loadWorkspace(storage);
    initDoc(reloaded.ws, '另一标签页改了这份文档，已热载');
  });
}
