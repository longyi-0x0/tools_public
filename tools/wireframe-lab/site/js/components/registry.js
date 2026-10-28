import buyButton from "./buy-button.js";
import productCard from "./product-card.js";

const COMPONENTS = [productCard, buyButton];
const byId = new Map(COMPONENTS.map((component) => [component.id, component]));

export function listComponents() {
  return COMPONENTS;
}

export function getComponent(id) {
  return byId.get(id) ?? null;
}

export function componentProps(component, props = {}) {
  const merged = {};
  for (const field of component?.propsSchema ?? []) {
    merged[field.key] = props[field.key] ?? field.default;
  }
  return { ...merged, ...props };
}

export function mountComponent(componentId, element, props) {
  const component = getComponent(componentId);
  if (!component) throw new Error("组件未注册");
  return component.mount(element, componentProps(component, props));
}
