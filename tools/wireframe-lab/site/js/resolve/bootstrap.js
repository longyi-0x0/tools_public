import {
  createRegistry,
  installDefaultSet,
  localLoader,
  registerLocals,
  registerScheme,
} from "./registry.js";
import { listComponents } from "../components/registry.js";

/** 默认注册表：内置 default 集合 + 本地组件 + local: scheme。 */
export function createDefaultRegistry() {
  const registry = createRegistry();
  installDefaultSet(registry);
  registerLocals(registry, listComponents());
  registerScheme(registry, "local", localLoader(registry));
  return registry;
}

export const registry = createDefaultRegistry();
