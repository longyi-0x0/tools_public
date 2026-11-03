// 布局树渲染：把 Variant.tree 变成 DOM，槽位交给 mountSlot 挂面板。
//
// 两条尺寸规则，只在这一个文件里：
//   - 带 fixed 的子节点按像素占位（预览列宽度、日志高度这类「不跟着栅格走」的部位）；
//   - 不带 fixed 的子节点按父节点的 ratio 分剩余空间。
// 间隔与分割线都不归面板管：间距由 .split 的 gap 统一给，面板自己就是卡片，
// 所以这里不再画发丝线。

function build(node, mountSlot) {
  if (node.type === "slot") {
    const el = document.createElement("section");
    el.className = "slot";
    el.dataset.slot = node.id;
    mountSlot(node.id, el);
    return el;
  }

  const el = document.createElement("div");
  el.className = `split split-${node.dir}`;
  const kids = node.children.map((child) => build(child, mountSlot));
  // 比例要先归一：一侧固定成像素后，另一侧的 grow 必须补满 1，
  // 否则剩余空间只会被吃掉 ratio 那一份，剩下的一截空着。
  const ratios = node.children.map((child, index) => (
    child.fixed ? 0 : index === 0 ? node.ratio : 1 - node.ratio
  ));
  const total = ratios.reduce((sum, ratio) => sum + ratio, 0) || 1;
  kids.forEach((kid, index) => {
    size(kid, node.children[index], node.dir, ratios[index] / total);
  });
  el.append(...kids);
  return el;
}

// fixed 会跟着视口退让（min(...)），但退让有下限：窗口再窄也不至于把固定侧压没。
// 轴向由父节点的方向决定——横向的 fixed 是宽度，纵向的是高度。
function size(el, node, dir, ratio) {
  if (!node.fixed) {
    el.style.flex = `${ratio} 1 0%`;
    return;
  }
  const cap = dir === "row" ? "40vw" : "26vh";
  el.style.flex = `0 1 min(${node.fixed}px, ${cap})`;
}

export function renderLayout(container, tree, mountSlot) {
  container.replaceChildren(build(tree, mountSlot));
}
