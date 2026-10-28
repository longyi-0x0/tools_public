import { isHandle, normalizeUse, splitHandle } from "../core/schema.js";

export class UnsupportedSchemeError extends Error {
  constructor(scheme) {
    super(`${scheme}: 尚未实现，这条候选会被跳过`);
    this.name = "UnsupportedSchemeError";
    this.scheme = scheme;
  }
}

export function npmLoader() {
  throw new UnsupportedSchemeError("npm");
}

/**
 * 模块加载是异步的，解析是同步的。先把 file:/https: 引到的模块塞进缓存，
 * 渲染路径再从缓存里同步取，这样 IR 生成不用等 Promise。
 */
export function createModuleCache() {
  return new Map();
}

export function createModuleLoader(cache, scheme) {
  return (rest) => {
    const module = cache.get(`${scheme}:${rest}`);
    return module ? moduleToTarget(module, `${scheme}:${rest}`) : null;
  };
}

export function moduleToTarget(module, ref) {
  const exported = module?.default ?? module;
  if (!exported) return null;
  if (!exported.Component && typeof exported.render !== "function") return null;
  return {
    id: ref,
    name: exported.name ?? ref,
    honorsStructure: exported.honorsStructure !== false,
    slots: Array.isArray(exported.slots) ? exported.slots : [],
    propsSchema: Array.isArray(exported.propsSchema) ? exported.propsSchema : [],
    defaultSize: exported.defaultSize ?? null,
    Component: exported.Component ?? null,
    render: exported.render ?? null,
    honorsStructureDeclared: exported.honorsStructure !== undefined,
  };
}

export async function preloadModules(doc, cache, importer) {
  const refs = new Set();
  for (const node of Object.values(doc?.nodes ?? {})) {
    for (const entry of normalizeUse(node.use)) {
      if (!isHandle(entry.src)) continue;
      const { scheme } = splitHandle(entry.src);
      if (scheme === "file" || scheme === "https") refs.add(entry.src);
    }
  }
  for (const ref of refs) {
    const { scheme, rest } = splitHandle(ref);
    try {
      cache.set(ref, await importer(rest, scheme));
    } catch (error) {
      cache.set(ref, null);
      console.warn(`模块加载失败：${ref}`, error);
    }
  }
  return cache;
}
