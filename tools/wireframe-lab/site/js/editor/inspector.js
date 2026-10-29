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
} from "../core/constants.js";
import { nodeDisplayName } from "../core/ast.js";
import {
  isPlainObject,
  layoutParamsOf,
  normalizeUse,
  positionOf,
  slotNamesOf,
} from "../core/schema.js";
import { escapeHtml, tokenOptions } from "./dom.js";
import { listComponents } from "../components/registry.js";
import { registry } from "../resolve/bootstrap.js";
import { baseNameOf, findSemantic, SEMANTIC_TARGETS } from "../resolve/vocabulary.js";
import { inspectUse, resolveNode } from "../resolve/resolve.js";

export function renderInspector(app) {
  const root = document.querySelector("#inspector");
  const subtitle = document.querySelector("#inspector-subtitle");
  const sets = app.sets;
  const node = app.doc.nodes[app.selectionId] ?? app.doc.nodes[app.doc.root];
  if (!node) {
    root.innerHTML = '<div class="insp-empty">文档里还没有节点</div>';
    subtitle.textContent = "未选择";
    return;
  }

  subtitle.textContent = node.id === app.doc.root ? "整页的布局与结构" : nodeDisplayName(node);
  root.innerHTML = [
    identityBlock(node),
    layoutSection(node),
    slotsSection(node, app.doc),
    useSection(node, sets),
    propsSection(node),
    descSection(node),
    sizeSection(node),
    positionSection(node, app.doc),
    actionSection(node, app.doc),
  ].join("");

  root.onclick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const value = button.dataset.value;
    if (action === "layout") return app.changeLayout(node.id, value);
    if (action === "layout-none") {
      return commit(app, "去掉布局", (draft) => {
        delete draft.nodes[node.id].layout;
        delete draft.nodes[node.id].layoutProps;
      });
    }
    if (action === "gap" || action === "align" || action === "distribute" || action === "columns") {
      const payload = action === "columns" ? Number(value) : value;
      return commit(app, "修改布局参数", (draft) => {
        const target = draft.nodes[node.id];
        target.layoutProps = { ...(target.layoutProps ?? {}), [action]: payload };
      });
    }
    if (action === "slot-add") {
      const input = root.querySelector("#slot-name");
      const name = (input?.value ?? "").trim();
      if (!name) return;
      return commit(app, "添加槽位", (draft) => {
        const target = draft.nodes[node.id];
        const slots = slotNamesOf(target);
        if (slots.includes(name)) return;
        target.slots = [...slots, name];
      });
    }
    if (action === "slot-remove") {
      return commit(app, "删除槽位", (draft) => {
        const target = draft.nodes[node.id];
        target.slots = slotNamesOf(target).filter((name) => name !== value);
        if (target.slots.length === 0) delete target.slots;
        for (const child of Object.values(draft.nodes)) {
          if (child.parent === node.id && child.slot === value) delete child.slot;
        }
      });
    }
    if (action === "use-remove" || action === "use-up" || action === "use-down") {
      const index = Number(button.dataset.index);
      return commit(app, "调整候选链", (draft) => {
        const target = draft.nodes[node.id];
        const entries = [...normalizeUse(target.use)];
        if (action === "use-remove") entries.splice(index, 1);
        else {
          const to = action === "use-up" ? index - 1 : index + 1;
          if (to < 0 || to >= entries.length) return;
          [entries[index], entries[to]] = [entries[to], entries[index]];
        }
        target.use = entries.map((entry) =>
          entry.props ? { src: entry.src, props: entry.props } : entry.src,
        );
      });
    }
    if (action === "use-add") {
      const select = root.querySelector("#use-add");
      const custom = root.querySelector("#use-custom");
      const picked = custom?.value?.trim() || select?.value || "";
      if (!picked) return;
      return commit(app, "加入候选链", (draft) => {
        const target = draft.nodes[node.id];
        target.use = [...normalizeUse(target.use).map(toStored), picked];
      });
    }
    if (action === "prop-add") {
      const key = root.querySelector("#prop-new-key")?.value?.trim();
      const raw = root.querySelector("#prop-new-value")?.value ?? "";
      if (!key) return;
      return commit(app, "新增属性", (draft) => {
        const target = draft.nodes[node.id];
        target.props = { ...(target.props ?? {}), [key]: coerce(raw) };
      });
    }
    if (action === "position-flow") {
      return commit(app, "回到文档流", (draft) => {
        delete draft.nodes[node.id].position;
      });
    }
    if (action === "position-anchor") {
      return commit(app, "设为悬浮", (draft) => {
        draft.nodes[node.id].position = {
          mode: "anchor",
          anchor: "br",
          inset: { x: "md", y: "md" },
        };
      });
    }
    if (action === "anchor") {
      return commit(app, "修改锚点", (draft) => {
        draft.nodes[node.id].position.anchor = value;
      });
    }
    if (action === "delete") return app.deleteNode(node.id);
  };

  root.onchange = (event) => {
    const target = event.target;
    const edit = target.dataset.edit;
    if (!edit) return;
    if (edit === "inset") {
      const axis = target.dataset.axis;
      return commit(app, "修改锚点距离", (draft) => {
        draft.nodes[node.id].position.inset = {
          ...draft.nodes[node.id].position.inset,
          [axis]: target.value,
        };
      });
    }
    if (edit === "abs") {
      const key = target.dataset.key;
      return commit(app, "调整绝对定位", (draft) => {
        const position = { ...draft.nodes[node.id].position };
        position[key] = Number(target.value) || 0;
        draft.nodes[node.id].position = position;
      });
    }
    if (edit === "size") {
      const key = target.dataset.key;
      return commit(app, "调整尺寸", (draft) => {
        const size = { ...(draft.nodes[node.id].size ?? {}) };
        const raw = target.value.trim();
        if (!raw) delete size[key];
        else size[key] = key === "aspect" ? raw : Number(raw) || raw;
        if (Object.keys(size).length === 0) delete draft.nodes[node.id].size;
        else draft.nodes[node.id].size = size;
      });
    }
    if (edit === "desc") {
      return commit(app, "修改说明", (draft) => {
        const target2 = draft.nodes[node.id];
        const text = target.value.trim();
        if (text) target2.desc = text;
        else delete target2.desc;
      });
    }
    if (edit === "prop") {
      const key = target.dataset.key;
      const type = target.dataset.type;
      return commit(app, "修改属性", (draft) => {
        const target2 = draft.nodes[node.id];
        let value = target.value;
        if (type === "number") value = Number(value);
        if (type === "boolean") value = target.checked;
        if (type === "list") {
          value = value
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean);
        }
        target2.props = { ...(target2.props ?? {}), [key]: value };
      });
    }
    if (edit === "use-props") {
      const index = Number(target.dataset.index);
      return commit(app, "修改候选属性", (draft) => {
        const target2 = draft.nodes[node.id];
        const entries = normalizeUse(target2.use);
        let parsed = null;
        try {
          parsed = target.value.trim() ? JSON.parse(target.value) : null;
        } catch {
          return;
        }
        if (!isPlainObject(parsed)) parsed = null;
        entries[index] = { src: entries[index].src, props: parsed };
        target2.use = entries.map(toStored);
      });
    }
  };
}

function identityBlock(node) {
  return `
    <div class="insp-identity">
      <span class="insp-type-icon">${escapeHtml(glyphFor(node))}</span>
      <div class="insp-identity-copy">
        <b>${escapeHtml(nodeDisplayName(node))}</b>
        <code>${escapeHtml(node.id)}</code>
      </div>
      <span class="type-pill">${escapeHtml(pillText(node))}</span>
    </div>`;
}

function layoutSection(node) {
  const layout = node.layout;
  const params = layoutParamsOf(node) ?? {};
  const layoutButtons = LAYOUTS.map(
    (item) => `
      <button type="button" data-action="layout" data-value="${item}"
        class="${layout === item ? "is-active" : ""}" title="${LAYOUT_LABELS[item]}">
        ${LAYOUT_GLYPHS[item]} ${LAYOUT_LABELS[item]}
      </button>`,
  ).join("");

  const gapButtons = GAP_TOKENS.map(
    (gap) => `
      <button type="button" data-action="gap" data-value="${gap}"
        class="${params.gap === gap ? "is-active" : ""}" title="${GAP_LABELS[gap]}">
        ${GAP_LABELS[gap]}
      </button>`,
  ).join("");

  const alignButtons = ALIGNS.map(
    (align) => `
      <button type="button" data-action="align" data-value="${align}"
        class="${params.align === align ? "is-active" : ""}">${ALIGN_LABELS[align]}</button>`,
  ).join("");

  const distributeButtons = DISTRIBUTES.map(
    (distribute) => `
      <button type="button" data-action="distribute" data-value="${distribute}"
        class="${params.distribute === distribute ? "is-active" : ""}">${DISTRIBUTE_LABELS[distribute]}</button>`,
  ).join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">布局 <small>决定子节点怎么排</small></div>
      <div class="seg">${layoutButtons}</div>
      <div class="insp-actions">
        <button class="btn" type="button" data-action="layout-none"${layout ? "" : " disabled"}>不排布</button>
      </div>
      ${layout
        ? `
          <div class="field" style="margin-top:10px">
            <div class="field-label">间距</div>
            <div class="seg">${gapButtons}</div>
          </div>
          ${layout === "grid"
            ? `
            <div class="field">
              <div class="field-label">列数</div>
              <div class="seg three">
                ${[2, 3, 4].map((count) => `
                  <button type="button" data-action="columns" data-value="${count}"
                    class="${Number(params.columns) === count ? "is-active" : ""}">${count} 列</button>
                `).join("")}
              </div>
            </div>`
            : layout === "free"
              ? `<p class="insp-note">自由布局用绝对坐标，子节点的 position 会逐个保留。</p>`
              : `
            <div class="field">
              <div class="field-label">对齐 <small>交叉轴</small></div>
              <div class="seg">${alignButtons}</div>
            </div>
            <div class="field">
              <div class="field-label">分布 <small>主轴</small></div>
              <div class="seg">${distributeButtons}</div>
            </div>`}
        `
        : `<p class="insp-note">没有布局时子节点不重排。任何节点都可以随时加上布局，包括按钮和图片。</p>`}
    </section>`;
}

function slotsSection(node, doc) {
  const slots = slotNamesOf(node);
  const rows = slots
    .map((name) => {
      const count = Object.values(doc.nodes).filter(
        (child) => child.parent === node.id && child.slot === name,
      ).length;
      return `
        <div class="slot-row">
          <b>${escapeHtml(name)}</b>
          <span>${count} 个</span>
          <button class="btn" type="button" data-action="slot-remove" data-value="${escapeHtml(name)}">移除</button>
        </div>`;
    })
    .join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">具名槽位 <small>子节点可指定落位</small></div>
      ${rows ? `<div class="slot-list">${rows}</div>` : `<p class="insp-note">没有声明槽位，子节点按顺序排。</p>`}
      <div class="field-row">
        <div class="field"><label>新槽位名</label><input id="slot-name" type="text" placeholder="例如 left"></div>
        <div class="field"><label>&nbsp;</label><button class="btn" type="button" data-action="slot-add">添加</button></div>
      </div>
    </section>`;
}

function useSection(node, sets) {
  const entries = normalizeUse(node.use);
  const rows = entries
    .map((entry, index) => {
      const target = inspectUse(registry, node, sets)[index]?.target;
      const status = target
        ? `命中 ${escapeHtml(target.key ?? target.id ?? target.name ?? "")}`
        : "未命中";
      return `
        <div class="slot-row">
          <b>${index + 1}. ${escapeHtml(entry.src)}</b>
          <span>${status}</span>
          <button class="btn" type="button" data-action="use-up" data-index="${index}"${index === 0 ? " disabled" : ""}>↑</button>
          <button class="btn" type="button" data-action="use-down" data-index="${index}"${index === entries.length - 1 ? " disabled" : ""}>↓</button>
          <button class="btn" type="button" data-action="use-remove" data-index="${index}">移除</button>
        </div>
        <div class="field">
          <label>候选属性 <small>JSON，可留空</small></label>
          <input type="text" data-edit="use-props" data-index="${index}"
            value="${escapeHtml(entry.props ? JSON.stringify(entry.props) : "")}">
        </div>`;
    })
    .join("");

  const resolved = resolveNode(registry, node, sets);
  const choiceOf = [
    ...SEMANTIC_TARGETS.map(
      (entry) => `<option value="${entry.name}">${entry.label}（${entry.name}）</option>`,
    ),
    ...listComponents().map(
      (component) => `<option value="local:${component.id}">${component.name}（local:${component.id}）</option>`,
    ),
  ].join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">渲染来源 <small>有序候选链</small></div>
      ${rows || `<p class="insp-note">没有候选，节点按纯布局盒渲染。</p>`}
      <div class="field">
        <div class="field-label">当前渲染</div>
        <p class="insp-note ${resolved.target ? "blue" : ""}">
          ${resolved.target
            ? `${escapeHtml(resolved.target.name ?? resolved.target.id ?? "")}${resolved.target.honorsStructure ? " · 承诺遵守结构" : " · 自行决定内部"}`
            : "全部未命中，显示占位块与说明"}
        </p>
      </div>
      <div class="field">
        <label for="use-add">加入候选</label>
        <select id="use-add">${choiceOf}</select>
      </div>
      <div class="field">
        <label for="use-custom">或直接写标识 / 句柄</label>
        <input id="use-custom" type="text" placeholder="ios.button.filled 或 file:./x.js">
      </div>
      <div class="insp-actions">
        <button class="btn" type="button" data-action="use-add">加到最后</button>
      </div>
      <p class="insp-note">越靠前优先级越高。写全限定 id 可越过项目默认集；句柄用 scheme: 开头。</p>
    </section>`;
}

function propsSection(node) {
  const first = normalizeUse(node.use)[0];
  const semantic = first ? findSemantic(baseNameOf(first.src)) : null;
  const props = node.props ?? {};

  const fields = semantic
    ? semantic.propsSchema
        .map((field) => {
          const value = props[field.key] ?? "";
          if (field.type === "boolean") {
            return `
              <label class="check-field">
                <input type="checkbox" data-edit="prop" data-key="${escapeHtml(field.key)}" data-type="boolean" ${value ? "checked" : ""}>
                ${escapeHtml(field.label)}
              </label>`;
          }
          return `
            <div class="field">
              <label>${escapeHtml(field.label)} <small>${escapeHtml(field.key)}</small></label>
              <input type="${field.type === "number" ? "number" : "text"}"
                data-edit="prop" data-key="${escapeHtml(field.key)}" data-type="${field.type}"
                value="${escapeHtml(Array.isArray(value) ? value.join("，") : value)}">
            </div>`;
        })
        .join("")
    : "";

  const extras = Object.keys(props)
    .filter((key) => !semantic?.propsSchema.some((field) => field.key === key))
    .map(
      (key) => `
        <div class="slot-row">
          <b>${escapeHtml(key)}</b>
          <span>${escapeHtml(String(props[key]))}</span>
        </div>`,
    )
    .join("");

  return `
    <section class="insp-section">
      <div class="insp-section-title">属性 <small>原样透传给目标</small></div>
      ${fields || `<p class="insp-note">这个候选没有语义词表，属性会原样透传。</p>`}
      ${extras ? `<div class="slot-list">${extras}</div>` : ""}
      <div class="field-row">
        <div class="field"><label>额外属性</label><input id="prop-new-key" type="text" placeholder="key"></div>
        <div class="field"><label>值</label><input id="prop-new-value" type="text" placeholder="value"></div>
      </div>
      <div class="insp-actions">
        <button class="btn" type="button" data-action="prop-add">加上去</button>
      </div>
    </section>`;
}

function descSection(node) {
  return `
    <section class="insp-section">
      <div class="insp-section-title">说明 <small>解析不到时的兜底文字</small></div>
      <div class="field">
        <input type="text" data-edit="desc" value="${escapeHtml(node.desc ?? "")}" placeholder="这块是什么">
      </div>
    </section>`;
}

function sizeSection(node) {
  const size = node.size ?? {};
  const field = (key, label, value) => `
    <div class="field">
      <label>${label}</label>
      <input type="text" data-edit="size" data-key="${key}" value="${escapeHtml(value ?? "")}">
    </div>`;
  return `
    <section class="insp-section">
      <div class="insp-section-title">尺寸 <small>留空即跟随内容</small></div>
      <div class="field-row">
        ${field("width", "宽", size.width)}
        ${field("height", "高", size.height)}
      </div>
      <div class="field-row">
        ${field("minWidth", "最小宽", size.minWidth)}
        ${field("maxWidth", "最大宽", size.maxWidth)}
      </div>
      <div class="field-row">
        ${field("aspect", "宽高比", size.aspect)}
      </div>
      <p class="insp-note">宽高可填 fill、auto、像素或百分比（如 50%）。</p>
    </section>`;
}

function positionSection(node, doc) {
  if (node.id === doc.root) {
    return `
      <section class="insp-section">
        <div class="insp-note">根节点代表整页，只能改布局，不能定位或删除。</div>
      </section>`;
  }
  const position = positionOf(node);
  if (position.mode === "absolute") {
    const field = (key, label, value) => `
      <div class="field"><label>${label}</label>
        <input type="number" data-edit="abs" data-key="${key}" value="${Math.round(value ?? 0)}">
      </div>`;
    return `
      <section class="insp-section">
        <div class="insp-section-title">绝对定位 <small>自由布局的子节点</small></div>
        <div class="field-row">
          ${field("x", "X", position.x)}
          ${field("y", "Y", position.y)}
        </div>
        <div class="field-row">
          ${field("w", "宽", position.w)}
          ${field("h", "高", position.h)}
        </div>
        <div class="insp-actions">
          <button class="btn" type="button" data-action="position-flow">回到文档流</button>
        </div>
      </section>`;
  }
  if (position.mode === "anchor") {
    const anchors = ANCHORS.map(
      (anchor) => `
        <button type="button" data-action="anchor" data-value="${anchor}"
          class="${position.anchor === anchor ? "is-active" : ""}"
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
            <select data-edit="inset" data-axis="x">${tokenOptions(position.inset?.x, INSET_TOKENS, INSET_LABELS)}</select>
          </div>
          <div class="field">
            <label>纵向距离</label>
            <select data-edit="inset" data-axis="y">${tokenOptions(position.inset?.y, INSET_TOKENS, INSET_LABELS)}</select>
          </div>
        </div>
        <div class="insp-actions">
          <button class="btn" type="button" data-action="position-flow">取消悬浮</button>
        </div>
      </section>`;
  }
  return `
    <section class="insp-section">
      <div class="insp-section-title">定位 <small>参与父布局流</small></div>
      <p class="insp-note">位置由父容器与同级顺序决定。</p>
      <div class="insp-actions">
        <button class="btn" type="button" data-action="position-anchor">设为悬浮</button>
      </div>
    </section>`;
}

function actionSection(node, doc) {
  if (node.id === doc.root) {
    return `
      <section class="insp-section insp-actions">
        <div class="insp-note">根节点代表整页。可以切布局，但不能删除或悬浮。</div>
      </section>`;
  }
  return `
    <section class="insp-section insp-actions">
      <button class="btn btn-danger" type="button" data-action="delete">删除这个节点</button>
    </section>`;
}

function pillText(node) {
  const first = normalizeUse(node.use)[0];
  if (first) return first.src;
  if (node.layout) return LAYOUT_LABELS[node.layout] ?? "布局";
  return "空节点";
}

function glyphFor(node) {
  if (node.layout) return LAYOUT_GLYPHS[node.layout] ?? "▢";
  const first = normalizeUse(node.use)[0];
  const base = first ? baseNameOf(first.src) : null;
  return (
    { text: "T", image: "▧", button: "◉", input: "⌸", placeholder: "▢", navbar: "▔", tabs: "▤" }[
      base
    ] ?? "·"
  );
}

function toStored(entry) {
  return entry.props ? { src: entry.src, props: entry.props } : entry.src;
}

function coerce(raw) {
  const text = String(raw).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text;
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
