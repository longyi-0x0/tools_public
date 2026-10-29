import { DEFAULT_SET_ID } from "./constants.js";
import { createDocument, newId } from "./ast.js";
import { isPlainObject } from "./schema.js";

/** 项目层的版本号。页面那份 schemaVersion（2）归页面自己管，两者互不相干。 */
export const PROJECT_SCHEMA_VERSION = 1;

/** 组件集声明在放进项目之前先过一遍：只留认识的键，脏条目直接丢。 */
export function normalizeSets(sets) {
  if (!Array.isArray(sets)) return [{ id: DEFAULT_SET_ID, version: "1" }];
  const result = [];
  const seen = new Set();
  for (const entry of sets) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || !entry.id) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const next = { id: entry.id };
    if (typeof entry.version === "string") next.version = entry.version;
    if (entry.enabled === false) next.enabled = false;
    result.push(next);
  }
  return result.length > 0 ? result : [{ id: DEFAULT_SET_ID, version: "1" }];
}

function now() {
  return Date.now();
}

export function createProject({ name = "未命名项目", description = "", sets, firstPageTitle = "首页" } = {}) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId("pj"),
    name: String(name).trim() || "未命名项目",
    description: String(description ?? ""),
    sets: normalizeSets(sets),
    pages: [createPage({ title: firstPageTitle })],
    createdAt: now(),
    updatedAt: now(),
  };
}

export function createPage({ title = "未命名页面", doc } = {}) {
  return {
    id: newId("pg"),
    title: String(title).trim() || "未命名页面",
    doc: doc ?? createDocument(title),
  };
}

export function pageOf(project, pageId) {
  return project.pages.find((page) => page.id === pageId) ?? null;
}

export function pageIndexOf(project, pageId) {
  return project.pages.findIndex((page) => page.id === pageId);
}

export function addPage(project, page, index = Infinity) {
  const at = Math.max(0, Math.min(index, project.pages.length));
  project.pages.splice(at, 0, page);
  touch(project);
  return page;
}

/** 项目至少留一页：删到最后一页时由调用方先问，这里只负责挡住。 */
export function removePage(project, pageId) {
  if (project.pages.length <= 1) throw new Error("项目至少要留一页");
  const at = pageIndexOf(project, pageId);
  if (at < 0) return null;
  const [removed] = project.pages.splice(at, 1);
  touch(project);
  return removed;
}

export function renamePage(project, pageId, title) {
  const page = pageOf(project, pageId);
  if (!page) return null;
  const next = String(title).trim() || "未命名页面";
  page.title = next;
  page.doc.title = next;
  touch(project);
  return page;
}

export function movePage(project, pageId, toIndex) {
  const at = pageIndexOf(project, pageId);
  if (at < 0) return null;
  const to = Math.max(0, Math.min(toIndex, project.pages.length - 1));
  if (to === at) return pageOf(project, pageId);
  const [page] = project.pages.splice(at, 1);
  project.pages.splice(to, 0, page);
  touch(project);
  return page;
}

/** 复制页：页面 id 与文档 id 都换新，节点 id 不动——它们只在页内唯一。 */
export function clonePage(project, pageId) {
  const source = pageOf(project, pageId);
  if (!source) return null;
  const doc = structuredClone(source.doc);
  doc.id = newId("p");
  const page = createPage({ title: `${source.title} 副本`, doc });
  addPage(project, page, pageIndexOf(project, pageId) + 1);
  return page;
}

export function renameProject(project, name) {
  project.name = String(name).trim() || "未命名项目";
  touch(project);
  return project;
}

export function touch(project) {
  project.updatedAt = now();
  return project;
}

export function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    pageCount: project.pages.length,
    updatedAt: project.updatedAt ?? 0,
  };
}

/** 把一份组件集声明并进项目。同 id 已存在就保留项目里那条，重复声明没有信息量。 */
export function mergeSets(project, sets) {
  const declared = new Set(normalizeSets(project.sets).map((entry) => entry.id));
  let added = 0;
  for (const entry of Array.isArray(sets) ? sets : []) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || !entry.id) continue;
    if (declared.has(entry.id)) continue;
    declared.add(entry.id);
    project.sets.push(normalizeSets([entry])[0]);
    added += 1;
  }
  if (added > 0) touch(project);
  return added;
}

/** 旧页面 JSON 带着 sets：并进项目，页面字段随即删掉。返回并入的条数。 */
export function absorbPageSets(project, doc) {
  if (!Array.isArray(doc?.sets)) return 0;
  const sets = doc.sets;
  delete doc.sets;
  return mergeSets(project, sets);
}

/** 结构层：错到这份项目没法打开才算错。组件能不能解析是契约层的事，不在这里判。 */
export function validateProject(project) {
  const errors = [];
  if (!isPlainObject(project)) return ["项目必须是对象"];
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    errors.push(`项目的 schemaVersion 必须是 ${PROJECT_SCHEMA_VERSION}`);
  }
  if (typeof project.id !== "string" || !project.id) errors.push("项目缺少 id");
  if (typeof project.name !== "string" || !project.name.trim()) errors.push("项目缺少名称");

  errors.push(...validateSets(project.sets));

  if (!Array.isArray(project.pages) || project.pages.length === 0) {
    return [...new Set([...errors, "项目至少有一页"])];
  }
  const seenPages = new Set();
  const seenDocs = new Set();
  for (const page of project.pages) {
    if (!isPlainObject(page)) {
      errors.push("页面条目必须是对象");
      continue;
    }
    if (typeof page.id !== "string" || !page.id) {
      errors.push("页面缺少 id");
      continue;
    }
    if (seenPages.has(page.id)) errors.push(`页面 ${page.id} 重复`);
    seenPages.add(page.id);
    if (typeof page.title !== "string" || !page.title.trim()) {
      errors.push(`页面 ${page.id} 缺少标题`);
    }
    const doc = page.doc;
    if (!isPlainObject(doc) || !isPlainObject(doc.nodes)) {
      errors.push(`页面 ${page.id} 的文档不是有效的页面 JSON`);
      continue;
    }
    if (typeof doc.id === "string" && seenDocs.has(doc.id)) {
      errors.push(`页面 ${page.id} 的文档 id 与同项目里的另一页重复`);
    }
    if (typeof doc.id === "string") seenDocs.add(doc.id);
  }
  return [...new Set(errors)];
}

export function validateSets(sets) {
  const errors = [];
  if (!Array.isArray(sets)) {
    errors.push("sets 必须是数组");
    return errors;
  }
  const seen = new Set();
  for (const entry of sets) {
    if (!isPlainObject(entry)) {
      errors.push("sets 里的条目必须是对象");
      continue;
    }
    if (typeof entry.id !== "string" || !entry.id) {
      errors.push("sets 条目缺少 id");
      continue;
    }
    if (entry.id.includes(".")) errors.push(`集合 ${entry.id} 的 id 不能含点`);
    if (seen.has(entry.id)) errors.push(`集合 ${entry.id} 重复声明`);
    seen.add(entry.id);
    if (entry.version != null && typeof entry.version !== "string") {
      errors.push(`集合 ${entry.id} 的 version 必须是字符串`);
    }
    if (entry.enabled != null && typeof entry.enabled !== "boolean") {
      errors.push(`集合 ${entry.id} 的 enabled 必须是布尔`);
    }
  }
  return errors;
}
