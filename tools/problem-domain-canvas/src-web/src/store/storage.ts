/**
 * 键常量与 Storage 适配器（04 §3.1：键只在 storage.ts 里拼，别处禁止写字符串）。
 * 只依赖注入的 StorageLike，所以纯函数层能测。
 */
export const PREFIX = 'problem-domain-canvas';

export const STORAGE_KEYS = {
  workspace: `${PREFIX}:workspace:v2`,
  backup: `${PREFIX}:workspace:backup:v2`,
  session: `${PREFIX}:session:v1`,
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = `${PREFIX}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
