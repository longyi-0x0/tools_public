import { validateDocument } from "./core/validate.js";

const DOC_KEY = "wireframe-lab:doc:v1";
const SESSION_KEY = "wireframe-lab:session:v1";

export function loadStoredDocument() {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (!raw) return { doc: null, error: null };
    const doc = JSON.parse(raw);
    const errors = validateDocument(doc);
    if (errors.length > 0) {
      return { doc: null, error: errors[0] };
    }
    return { doc, error: null };
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
