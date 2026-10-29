import {
  installedSetIds,
  installedSets,
  mergeProps,
  normalizeUse,
} from "../core/schema.js";
import { classify } from "./parse-use.js";

/**
 * 一条候选的解析：句柄走 scheme loader，id 按组件集声明顺序查找。
 * 组件集由项目提供（`sets`），页面不再自带；解析不到不算错，
 * 只往 warnings 里记一句，调用方继续看下一条候选。
 */
export function resolveEntry(registry, sets, src, warnings = []) {
  const info = classify(src, installedSetIds(sets));
  if (info.kind === "invalid") {
    warnings.push("候选为空");
    return null;
  }
  if (info.kind === "handle") {
    const loader = registry.schemes.get(info.scheme);
    if (!loader) {
      warnings.push(`不认识的 scheme：${info.scheme}:`);
      return null;
    }
    try {
      const target = loader(info.rest);
      if (!target) warnings.push(`${info.scheme}: 找不到 ${info.rest}`);
      return target ?? null;
    } catch (error) {
      warnings.push(error.message);
      return null;
    }
  }
  if (info.qualified) {
    const set = registry.sets.get(info.setId);
    if (!set) {
      warnings.push(`集合 ${info.setId} 未安装`);
      return null;
    }
    const target = set.targets.get(info.name);
    if (!target) warnings.push(`集合 ${info.setId} 里没有 ${info.name}`);
    return target ?? null;
  }
  for (const entry of installedSets(sets)) {
    const target = registry.sets.get(entry.id)?.targets.get(info.name);
    if (target) return target;
  }
  return null;
}

/** 按序试候选，第一条命中的决定渲染；props 与槽位在调用处一并透传。 */
export function resolveNode(registry, node, sets) {
  const warnings = [];
  const entries = normalizeUse(node?.use);
  for (const entry of entries) {
    const target = resolveEntry(registry, sets, entry.src, warnings);
    if (!target) continue;
    return {
      target,
      source: entry.src,
      props: mergeProps(node?.props, entry.props),
      warnings,
    };
  }
  if (entries.length > 0) {
    warnings.push(`候选全部解析不到：${entries.map((entry) => entry.src).join(" / ")}`);
  }
  return { target: null, source: null, props: mergeProps(node?.props, null), warnings };
}

/** 给 inspector 用：当前候选链每一条的实际命中情况。 */
export function inspectUse(registry, node, sets) {
  const warnings = [];
  return normalizeUse(node?.use).map((entry) => ({
    src: entry.src,
    props: entry.props,
    target: resolveEntry(registry, sets, entry.src, warnings),
  }));
}
