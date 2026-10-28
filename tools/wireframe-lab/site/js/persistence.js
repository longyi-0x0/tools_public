import { validateDocument } from "./core/validate.js";
import { migrateDocument, needsMigration } from "./core/migrate.js";

const DOC_KEY = "wireframe-lab:doc:v1";
const SESSION_KEY = "wireframe-lab:session:v1";

/**
 * 存储键沿用同一个，靠 schemaVersion 判断要不要迁移。
 * 换键等于把用户已有的草稿弄丢，迁移才是正路。
 */
export function loadStoredDocument() {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return { doc: null, error: null };
    const parsed = JSON.parse(raw);
    const doc = needsMigration(parsed) ? migrateDocument(parsed) : parsed;
    const errors = validateDocument(doc);
    if (errors.length > 0) {
      return { doc: null, error: errors[0], migrated: needsMigration(parsed) };
    }
    return { doc, error: null, migrated: needsMigration(parsed) };
  } catch (error) {
    return { doc: null, error: error.message };
  }
}

export function saveDocument(doc) {
  localStorage.setItem(DOC_KEY, JSON.stringify(doc));
}

export function clearStoredDocument() {
  localStorage.removeItem(DOC_KEY);
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* 会话态丢了不影响文档。 */
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* 浏览器拒绝也不影响本地保存。 */
  }
}
