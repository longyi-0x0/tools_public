import { migrateDocument } from "./core/migrate.js";
import { validateDocument } from "./core/validate.js";
import { absorbPageSets, validateProject } from "./core/project.js";
import { parseDocument, stableStringify } from "./core/serialize.js";
import { isPlainObject } from "./core/schema.js";

export const PAGE_SUFFIX = ".wireframe.json";
export const PROJECT_SUFFIX = ".wireframe-project.json";

export const SIZE_LIMITS = { page: 2 * 1024 * 1024, project: 8 * 1024 * 1024 };

export function serializeProject(project) {
  return `${stableStringify(project)}\n`;
}

/** 项目与页面两种文件靠 pages 判别：页面没有这个字段。 */
export function detectKind(value) {
  if (!isPlainObject(value)) return null;
  if (Array.isArray(value.pages)) return "project";
  if (isPlainObject(value.nodes)) return "page";
  return null;
}

/** 页面文件可能还带着旧格式的 sets：先摘出来交给项目，再校验页面本身。 */
export function parsePage(text) {
  const doc = migrateDocument(parseDocument(text));
  const sets = Array.isArray(doc.sets) ? doc.sets : null;
  delete doc.sets;
  const errors = validateDocument(doc);
  if (errors.length > 0) throw new Error(errors[0]);
  return { doc, sets };
}

export function parseProject(text) {
  const project = JSON.parse(text);
  const errors = validateProject(project);
  if (errors.length > 0) throw new Error(errors[0]);
  for (const page of project.pages) {
    // 老文件里页面可能还带着 sets，并到项目上再删掉，之后才谈校验。
    absorbPageSets(project, page.doc);
    const pageErrors = validateDocument(page.doc);
    if (pageErrors.length > 0) throw new Error(`页面「${page.title}」：${pageErrors[0]}`);
  }
  return project;
}

export function parseImport(text) {
  const value = JSON.parse(text);
  const kind = detectKind(value);
  if (!kind) throw new Error("不认识这份 JSON：既不是页面也不是项目");
  if (kind === "project") return { kind, project: parseProject(text) };
  return { kind, ...parsePage(text) };
}

export function downloadFile(fileName, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
