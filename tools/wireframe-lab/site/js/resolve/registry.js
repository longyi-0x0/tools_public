import { DEFAULT_SET_ID } from "../core/constants.js";
import { createDefaultTargets } from "./vocabulary.js";

export function createRegistry() {
  return { sets: new Map(), locals: new Map(), schemes: new Map() };
}

export function installSet(registry, set) {
  if (!set?.id) throw new Error("集合缺少 id");
  if (set.id.includes(".")) throw new Error(`集合 id 不能含点：${set.id}`);
  const targets = new Map();
  for (const entry of set.targets ?? []) {
    if (!entry?.name) continue;
    targets.set(entry.name, { ...entry, setId: set.id, key: `${set.id}/${entry.name}` });
  }
  registry.sets.set(set.id, { id: set.id, version: set.version ?? null, targets });
  return registry;
}

export function installDefaultSet(registry, { version = "1" } = {}) {
  return installSet(registry, {
    id: DEFAULT_SET_ID,
    version,
    targets: createDefaultTargets(),
  });
}

export function registerLocal(registry, target) {
  if (!target?.id) throw new Error("本地组件缺少 id");
  registry.locals.set(target.id, target);
  return registry;
}

export function registerLocals(registry, targets) {
  for (const target of targets) registerLocal(registry, target);
  return registry;
}

export function registerScheme(registry, scheme, loader) {
  if (typeof loader !== "function") throw new Error("scheme loader 必须是函数");
  registry.schemes.set(scheme, loader);
  return registry;
}

export function lookupSet(registry, setId) {
  return registry.sets.get(setId) ?? null;
}

export function lookupTarget(registry, setId, name) {
  return registry.sets.get(setId)?.targets.get(name) ?? null;
}

/** 按 IR 里的 targetId 找目标：本地组件用裸 id，集合条目用 setId/name。 */
export function findTarget(registry, targetId) {
  if (typeof targetId !== "string" || !targetId) return null;
  const local = registry.locals.get(targetId);
  if (local) return local;
  const at = targetId.indexOf("/");
  if (at === -1) return null;
  return lookupTarget(registry, targetId.slice(0, at), targetId.slice(at + 1));
}

export function listTargets(registry) {
  const result = [];
  for (const set of registry.sets.values()) {
    for (const target of set.targets.values()) result.push(target);
  }
  for (const target of registry.locals.values()) result.push(target);
  return result;
}

export function localLoader(registry) {
  return (rest) => registry.locals.get(rest) ?? null;
}
