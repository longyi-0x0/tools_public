import {
  isHandle,
  isQualifiedId,
  splitHandle,
  splitId,
} from "../core/schema.js";

export {
  isHandle,
  isQualifiedId,
  mergeProps,
  normalizeUse,
  normalizeUseEntry,
  splitHandle,
  splitId,
} from "../core/schema.js";

/**
 * 唯一的判别入口：含冒号是句柄，不含是 id。
 * 全限定 id 的首段命中已安装集合时按精确匹配处理，否则整串当短名。
 */
export function classify(src, installedSetIds) {
  if (typeof src !== "string" || !src) return { kind: "invalid", src };
  if (isHandle(src)) {
    const { scheme, rest } = splitHandle(src);
    return { kind: "handle", src, scheme, rest };
  }
  const { setId, path, segments } = splitId(src);
  const qualified = segments.length > 1 && installedSetIds.has(setId);
  return {
    kind: "id",
    src,
    setId: qualified ? setId : null,
    name: qualified ? path.join(".") : src,
    qualified,
  };
}
