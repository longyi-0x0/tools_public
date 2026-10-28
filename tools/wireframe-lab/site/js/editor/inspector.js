import {
  ALIGN_LABELS,
  ALIGNS,
  ANCHORS,
  ANCHOR_LABELS,
  DISTRIBUTE_LABELS,
  DISTRIBUTES,
  GAP_LABELS,
  GAP_TOKENS,
  INSET_LABELS,
  INSET_TOKENS,
  LAYOUT_GLYPHS,
  LAYOUTS,
  LAYOUT_LABELS,
  PATTERN_SLOTS,
  SHAPE_LABELS,
  TYPE_LABELS,
} from "../core/constants.js";
import { childrenOf, nodeDisplayName } from "../core/ast.js";
import { escapeHtml, tokenOptions } from "./dom.js";
import {
  getComponent,
  listComponents,
} from "../components/registry.js";

export function renderInspector(app) {
  const root = document.querySelector("#inspector");
  const subtitle = document.querySelector("#inspector-subtitle");
  const node = app.doc.nodes[app.selectionId] ?? app.doc.nodes[app.doc.root];
  if (!node) {
    root.innerHTML = '<div class="insp-empty">文档里还没有节点</div>';
    subtitle.textContent = "未选择";
    return;
  }

  subtitle.textContent = node.id === app.doc.root ? "整页的布局与结构" : nodeDisplayName(node);
  root.innerHTML = [
    identityBlock(node),
    node.type === "container" ? containerSection(node) : "",
    node.type === "pattern" ? patternSection(node, app.doc) : "",
    node.type === "leaf" ? leafSection(node) : "",
    positionSection(node, app.doc),
    actionSection(node, app.doc),
  ].join("");

  root.onclick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "layout") app.changeLayout(node.id, button.dataset.value);
    if (action === "gap") commit(app, "修改间距", (draft) => set(draft, node.id, { gap: button.dataset.value }));
    if (action === "align") commit(app, "修改对齐", (draft) => set(draft, node.id, { align: button.dataset.value }));
    if (action === "distribute") commit(app, "修改分布", (draft) => set(draft, node.id, { distribute: button.dataset.value }));
    if (action === "columns") commit(app, "修改列数", (draft) => set(draft, node.id, { columns: Number(button.dataset.value) }));
    if (action === "anchor") {
      commit(app, "修改锚点", (draft) => {
        draft.nodes[node.id].escape.anchor = button.dataset.value;
      });
    }
    if (action === "escape-on") app.setEscaped(node.id, true);
    if (action === "escape-off") app.setEscaped(node.id, false);
    if (action === "unbind") app.bindComponent(node.id, "");
    if (action === "delete") app.deleteNode(node.id);
  };

  root.onchange = (event) => {
    const target = event.target;
    if (target.dataset.action === "bind") {
      app.bindComponent(node.id, target.value);
      return;
    }
    if (target.dataset.edit === "common-label") {
      commit(app, "修改文字", (draft) => set(draft, node.id, { label: target.value }));
      return;
    }
    if (target.dataset.edit === "navbar-title") {
      commit(app, "修改标题", (draft) => {
        draft.nodes[node.id].props = { ...(draft.nodes[node.id].props ?? {}), title: target.value };
      });
      return;
    }
    if (target.dataset.edit === "tabs-labels") {
      const labels = target.value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      commit(app, "修改标签", (draft) => {
        draft.nodes[node.id].props = {
          ...(draft.nodes[node.id].props ?? {}),
          labels: labels.length > 0 ? labels : ["概览"],
        };
      });
      return;
    }
    if (target.dataset.edit === "binding-prop") {
      const key = target.dataset.key;
      const type = target.dataset.type;
      let value = target.value;
      if (type === "number") value = Number(value);
      if (type === "boolean") value = target.checked;
      app.setBindingProp(node.id, key, value);
      return;
    }
    if (target.dataset.edit === "frame") {
      const key = target.dataset.key;
      const frame = { ...(app.doc.nodes[node.id].frame ?? {}) };
      frame[key] = Math.max(key === "w" || key === "h" ? 1 : 0, Number(target.value) || 0);
      commit(app, "调整自由位置", (draft) => {
        draft.nodes[node.id].frame = frame;
      });
      return;
    }
    if (target.dataset.edit === "escape-size") {
      const key = target.dataset.key;
      const size = { ...(app.doc.nodes[node.id].size ?? { w: 120, h: 40 }) };
      size[key] = Math.max(1, Number(target.value) || 1);
      commit(app, "调整悬浮尺寸", (draft) => {
        draft.nodes[node.id].size = size;
      });
      return;
    }
    if (target.dataset.edit === "inset") {
      const axis = target.dataset.axis;
      const escape = structuredClone(app.doc.nodes[node.id].escape);
      escape.inset[axis] = target.value;
      commit(app, "修改锚点距离", (draft) => {
        draft.nodes[node.id].escape = escape;
      });
    }
  };
}

function identityBlock(node) {
  const glyph =
    node.type === "container"
      ? LAYOUT_GLYPHS[node.layout]
      : node.type === "pattern"
        ? node.pattern === "navbar" ? "▔" : "▤"
        : "T";
  return `
    <div class="insp-identity">
      <span class="insp-type-icon">${escapeHtml(glyph)}</span>
      <div class="insp-identity-copy">
        <b>${escapeHtml(nodeDisplayName(node))}</b>
        <code>${escapeHtml(node.id)}</code>
      </div>
      <span class="type-pill">${escapeHtml(TYPE_LABELS[node.type] ?? node.type)}</span>
    </div>`;
}

function containerSection(node) {
  const layoutButtons = LAYOUTS.map(
    (layout) => `
      <button type="button" data-action="layout" data-value="${layout}"
        class="${node.layout === layout ? "is-active" : ""}" title="${LAYOUT_LABELS[layout]}">
        ${LAYOUT_GLYPHS[layout]} ${LAYOUT_LABELS[layout]}
      </button>`,
  ).join("");

  const gapButtons = GAP_TOKENS.map(
    (gap) => `
      <button type="button" data-action="gap" data-value="${gap}"
        class="${node.gap === gap ? "is-active" : ""}" title="${GAP_LABELS[gap]}">
        ${GAP_LABELS[gap]}
      </button>`,
  ).join("");

  const alignButtons = ALIGNS.map(
    (align) => `
      <button type="button" data-action="align" data-value="${align}"
        class="${node.align === align ? "is-active" : ""}">
        ${ALIGN_LABELS[align]}
      </button>`,
  ).join("");

  const distributeButtons = DISTRIBUTES.map(
    (distribute) => `
      <button type="button" data-action="distribute" data-value="${distribute}"
        class="${node.distribute === distribute ? "is-active" : ""}">
        ${DISTRIBUTE_LABELS[distribute]}
      </button>`,
  ).join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">布局模式 <small>父决定子怎么流</small></div>
      <div class="seg">${layoutButtons}</div>
      ${node.layout === "free"
        ? `<p class="insp-note">自由容器使用绝对坐标。它的子节点不会参与多尺寸重排，JSON 里会逐个保留 frame。</p>`
        : `
          <div class="field" style="margin-top:10px">
            <div class="field-label">间距</div>
            <div class="seg">${gapButtons}</div>
          </div>
          ${node.layout === "grid" ? `
            <div class="field">
              <div class="field-label">列数</div>
              <div class="seg three">
                ${[2, 3, 4].map((count) => `
                  <button type="button" data-action="columns" data-value="${count}"
                    class="${Number(node.columns) === count ? "is-active" : ""}">${count} 列</button>
                `).join("")}
              </div>
            </div>
          ` : `
            <div class="field">
              <div class="field-label">对齐 <small>交叉轴</small></div>
              <div class="seg">${alignButtons}</div>
            </div>
            <div class="field">
              <div class="field-label">分布 <small>主轴</small></div>
              <div class="seg">${distributeButtons}</div>
            </div>
          `}
        `}
    </section>`;
}

function patternSection(node, doc) {
  const definitions = PATTERN_SLOTS[node.pattern] ?? {};
  const slots = Object.entries(definitions)
    .map(([slotName, definition]) => {
      const count = childrenOf(doc, node.id, slotName).length;
      return `
        <div class="slot-row">
          <b>${escapeHtml(definition.label)}</b>
          <span>${count} / ${definition.max}</span>
        </div>`;
    })
    .join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">结构件</div>
      ${node.pattern === "navbar" ? `
        <div class="field">
          <label for="navbar-title">标题</label>
          <input id="navbar-title" type="text" data-edit="navbar-title" value="${escapeHtml(node.props?.title ?? "")}">
        </div>
      ` : `
        <div class="field">
          <label for="tabs-labels">标签 <small>用逗号分隔</small></label>
          <input id="tabs-labels" type="text" data-edit="tabs-labels"
            value="${escapeHtml((node.props?.labels ?? []).join("，"))}">
        </div>
      `}
      <div class="field">
        <div class="field-label">具名槽位</div>
        <div class="slot-list">
          ${slots}
        </div>
      </div>
      <p class="insp-note">结构件内部布局锁定，只能往槽位里放东西。想自由排布请改用普通容器。</p>
    </section>`;
}

function leafSection(node) {
  const components = listComponents();
  const binding = node.binding?.component ?? "";
  const component = getComponent(binding);
  const options = [
    '<option value="">线框态（灰块）</option>',
    ...components.map(
      (item) =>
        `<option value="${escapeHtml(item.id)}"${item.id === binding ? " selected" : ""}>${escapeHtml(item.name)}</option>`,
    ),
  ].join("");

  const props = component
    ? component.propsSchema
        .map((field) => {
          const value = node.binding?.props?.[field.key] ?? field.default;
          if (field.type === "boolean") {
            return `
              <label class="check-field">
                <input type="checkbox" data-edit="binding-prop" data-key="${escapeHtml(field.key)}" data-type="boolean" ${value ? "checked" : ""}>
                ${escapeHtml(field.label)}
              </label>`;
          }
          return `
            <div class="field">
              <label>${escapeHtml(field.label)}</label>
              <input type="${field.type === "number" ? "number" : "text"}"
                data-edit="binding-prop" data-key="${escapeHtml(field.key)}" data-type="${field.type}"
                value="${escapeHtml(value)}">
            </div>`;
        })
        .join("")
    : "";

  return `
    <section class="insp-section">
      <div class="insp-section-title">元素</div>
      <div class="field">
        <label for="leaf-label">文字</label>
        <input id="leaf-label" type="text" data-edit="common-label" value="${escapeHtml(node.label ?? "")}">
      </div>
      <div class="field">
        <div class="field-label">线框形状 <small>${escapeHtml(SHAPE_LABELS[node.shape] ?? node.shape)}</small></div>
      </div>
    </section>
    <section class="insp-section">
      <div class="insp-section-title">保真度 <small>逐个叶子替换</small></div>
      <div class="field">
        <div class="field-label">渲染来源</div>
        <select data-action="bind">${options}</select>
      </div>
      ${component ? `
        <div class="field">
          <span class="component-chip">${escapeHtml(component.name)}</span>
        </div>
        <p class="insp-note blue">${escapeHtml(component.description ?? "真实组件接管这个叶子，外部尺寸仍由布局决定。")}</p>
        ${props}
        <div class="insp-actions">
          <button class="btn" type="button" data-action="unbind">解绑，回到线框态</button>
        </div>
      ` : binding ? `
        <p class="insp-note">这个组件没有注册，当前回落到线框态。绑定信息仍保留在 AST 里。</p>
      ` : `
        <p class="insp-note">线框态是默认。绑定组件只改变这个叶子的内部，不影响同级排布。</p>
      `}
    </section>`;
}

function positionSection(node, doc) {
  if (node.id === doc.root) return "";
  if (node.frame) {
    return `
      <section class="insp-section">
        <div class="insp-section-title">自由位置 <small>绝对坐标</small></div>
        <div class="field-row">
          <div class="field"><label>X</label><input type="number" data-edit="frame" data-key="x" value="${Number(node.frame.x) || 0}"></div>
          <div class="field"><label>Y</label><input type="number" data-edit="frame" data-key="y" value="${Number(node.frame.y) || 0}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>宽</label><input type="number" data-edit="frame" data-key="w" value="${Math.round(node.frame.w)}"></div>
          <div class="field"><label>高</label><input type="number" data-edit="frame" data-key="h" value="${Math.round(node.frame.h)}"></div>
        </div>
      </section>`;
  }

  if (node.escape) {
    const anchors = ANCHORS.map(
      (anchor) => `
        <button type="button" data-action="anchor" data-value="${anchor}"
          class="${node.escape.anchor === anchor ? "is-active" : ""}"
          title="${ANCHOR_LABELS[anchor]}" aria-label="${ANCHOR_LABELS[anchor]}">
          ${anchorGlyph(anchor)}
        </button>`,
    ).join("");
    return `
      <section class="insp-section">
        <div class="insp-section-title">悬浮定位 <small>脱离父布局流</small></div>
        <div class="field">
          <div class="field-label">锚点</div>
          <div class="anchor-grid">${anchors}</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>横向距离</label>
            <select data-edit="inset" data-axis="x">${tokenOptions(node.escape.inset?.x, INSET_TOKENS, INSET_LABELS)}</select>
          </div>
          <div class="field">
            <label>纵向距离</label>
            <select data-edit="inset" data-axis="y">${tokenOptions(node.escape.inset?.y, INSET_TOKENS, INSET_LABELS)}</select>
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>宽</label><input type="number" data-edit="escape-size" data-key="w" value="${Math.round(node.size?.w ?? 120)}"></div>
          <div class="field"><label>高</label><input type="number" data-edit="escape-size" data-key="h" value="${Math.round(node.size?.h ?? 40)}"></div>
        </div>
        <p class="insp-note">锚定元素仍属于原来的父节点，但不参与父容器的流式排布。</p>
        <div class="insp-actions">
          <button class="btn" type="button" data-action="escape-off">取消悬浮</button>
        </div>
      </section>`;
  }

  return `
    <section class="insp-section">
      <div class="insp-section-title">定位 <small>参与父布局流</small></div>
      <p class="insp-note">位置由父容器与同级顺序决定。拖到别的容器会改变所属父节点，不改像素坐标。</p>
      <div class="insp-actions">
        <button class="btn" type="button" data-action="escape-on">设为悬浮</button>
      </div>
    </section>`;
}

function actionSection(node, doc) {
  if (node.id === doc.root) {
    return `
      <section class="insp-section insp-actions">
        <div class="insp-note">根节点代表整页。可切换布局，但不能删除或悬浮。</div>
      </section>`;
  }
  return `
    <section class="insp-section insp-actions">
      <button class="btn btn-danger" type="button" data-action="delete">删除这个节点</button>
    </section>`;
}

function set(draft, id, patch) {
  Object.assign(draft.nodes[id], patch);
}

function commit(app, label, mutate) {
  app.commit(label, mutate);
}

function anchorGlyph(anchor) {
  return {
    tl: "↖", tc: "↑", tr: "↗",
    cl: "←", c: "·", cr: "→",
    bl: "↙", bc: "↓", br: "↘",
  }[anchor];
}
