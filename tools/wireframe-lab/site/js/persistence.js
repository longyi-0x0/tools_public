import { validateDocument } from "./core/validate.js";
import { migrateDocument, needsMigration } from "./core/migrate.js";
import {
  createProject,
  mergeSets,
  projectSummary,
  validateProject,
} from "./core/project.js";
import { createSampleProject } from "./sample-project.js";

const WORKSPACE_SCHEMA_VERSION = 1;
const WORKSPACE_KEY = "wireframe-lab:workspace:v1";
const PROJECT_PREFIX = "wireframe-lab:project:";
const SESSION_KEY = "wireframe-lab:session:v1";
/** 项目层之前那一版只有一个键。读到就迁成项目，读不出来就丢——老版本也是这么兜底的。 */
const LEGACY_DOC_KEY = "wireframe-lab:doc:v1";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function emptyWorkspace() {
  return { schemaVersion: WORKSPACE_SCHEMA_VERSION, projects: [], currentProjectId: null };
}

export function loadWorkspace() {
  const stored = readJson(WORKSPACE_KEY);
  if (!stored || !Array.isArray(stored.projects)) return null;
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    projects: stored.projects.filter((entry) => entry && typeof entry.id === "string"),
    currentProjectId: typeof stored.currentProjectId === "string" ? stored.currentProjectId : null,
  };
}

export function saveWorkspace(workspace) {
  writeJson(WORKSPACE_KEY, workspace);
}

export function projectKey(projectId) {
  return `${PROJECT_PREFIX}${projectId}`;
}

export function loadProject(projectId) {
  const stored = readJson(projectKey(projectId));
  if (!stored) return { project: null, error: "项目正文不在本机" };
  try {
    const errors = validateProject(stored);
    if (errors.length > 0) return { project: null, error: errors[0] };
    for (const page of stored.pages) {
      const pageErrors = validateDocument(page.doc);
      if (pageErrors.length > 0) {
        return { project: null, error: `页面「${page.title}」打不开：${pageErrors[0]}` };
      }
    }
    return { project: stored, error: null };
  } catch (error) {
    return { project: null, error: error.message };
  }
}

export function saveProject(project) {
  writeJson(projectKey(project.id), project);
}

export function removeProject(projectId) {
  localStorage.removeItem(projectKey(projectId));
}

/** 存项目并同步索引。索引只放列表用得到的三个字段，不复制正文。 */
export function persistProject(workspace, project) {
  saveProject(project);
  const summary = projectSummary(project);
  const at = workspace.projects.findIndex((entry) => entry.id === project.id);
  if (at >= 0) workspace.projects[at] = summary;
  else workspace.projects.push(summary);
  workspace.currentProjectId = project.id;
  saveWorkspace(workspace);
  return workspace;
}

export function loadSession() {
  const stored = readJson(SESSION_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

export function saveSession(session) {
  try {
    writeJson(SESSION_KEY, session);
  } catch {
    /* 会话态丢了不影响项目正文。 */
  }
}

export function loadLegacyDocument() {
  const raw = localStorage.getItem(LEGACY_DOC_KEY);
  if (!raw) return { doc: null, sets: null, error: null };
  try {
    const parsed = JSON.parse(raw);
    const doc = needsMigration(parsed) ? migrateDocument(parsed) : parsed;
    // 组件集归项目之后再校验页面，所以先摘出来。
    const sets = Array.isArray(doc.sets) ? doc.sets : null;
    delete doc.sets;
    const errors = validateDocument(doc);
    if (errors.length > 0) return { doc: null, sets: null, error: errors[0] };
    return { doc, sets, error: null };
  } catch (error) {
    return { doc: null, sets: null, error: error.message };
  }
}

export function clearLegacyDocument() {
  localStorage.removeItem(LEGACY_DOC_KEY);
}

/** 旧的单页草稿变成一个项目，页里那份组件集并到项目上。 */
export function projectFromLegacyPage(doc, sets = null) {
  const project = createProject({
    name: "我的草稿",
    description: "项目层之前那一份本机草稿。",
    firstPageTitle: doc.title || "未命名页面",
  });
  project.pages[0].doc = doc;
  mergeSets(project, sets);
  return project;
}

/**
 * 打开工具时的第一件事：把索引、当前项目与示例种子都理顺。
 * 返回值里 notices 是给人看的一句话，error 表示当前项目不是用户上次那个。
 */
export function openWorkspace() {
  const notices = [];
  let workspace = loadWorkspace() ?? emptyWorkspace();
  let changed = false;

  const legacy = loadLegacyDocument();
  if (legacy.doc) {
    const project = projectFromLegacyPage(legacy.doc, legacy.sets);
    saveProject(project);
    persistProject(workspace, project);
    clearLegacyDocument();
    changed = true;
    notices.push(`本机那份旧草稿已并成项目「${project.name}」`);
  } else if (legacy.error) {
    clearLegacyDocument();
    notices.push(`旧草稿读不出来，已跳过：${legacy.error}`);
  }

  if (workspace.projects.length === 0) {
    const sample = createSampleProject();
    persistProject(workspace, sample);
    changed = true;
  }

  let loaded = workspace.currentProjectId
    ? loadProject(workspace.currentProjectId)
    : { project: null, error: null };
  if (!loaded.project) {
    workspace.projects = workspace.projects.filter(
      (entry) => entry.id !== workspace.currentProjectId,
    );
    for (const entry of workspace.projects) {
      const attempt = loadProject(entry.id);
      if (attempt.project) {
        loaded = attempt;
        workspace.currentProjectId = entry.id;
        changed = true;
        break;
      }
      workspace.projects = workspace.projects.filter((item) => item.id !== entry.id);
      changed = true;
    }
  }
  if (!loaded.project) {
    const sample = createSampleProject();
    persistProject(workspace, sample);
    loaded = { project: sample, error: null };
    changed = true;
    notices.push("本机项目都打不开，已重建示例项目");
  }

  if (changed) saveWorkspace(workspace);
  return { workspace, project: loaded.project, notices, error: loaded.error };
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* 浏览器拒绝也不影响本机保存。 */
  }
}
