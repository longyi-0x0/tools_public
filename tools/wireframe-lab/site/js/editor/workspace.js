/**
 * 项目层那两块界面：顶栏的项目切换器、左栏的页面列表，外加它们共用的弹出菜单。
 * 只负责画和报事件，动数据的事一律回给 app。
 */

export function renderProjectChip(app) {
  const name = document.querySelector("#project-name");
  const count = document.querySelector("#project-page-count");
  if (name) name.textContent = app.project.name;
  if (count) count.textContent = `${app.project.pages.length} 页 · ${app.workspace.projects.length} 个项目`;
}

export function renderPages(app) {
  const list = document.querySelector("#pages");
  if (!list) return;
  list.replaceChildren();
  app.project.pages.forEach((page, index) => {
    const row = document.createElement("div");
    row.className = "page-row";
    row.classList.toggle("is-active", page.id === app.pageId);

    const main = document.createElement("button");
    main.type = "button";
    main.className = "page-item";
    main.dataset.pageId = page.id;
    const nodeCount = Object.keys(page.doc.nodes).length;
    main.innerHTML = `
      <span class="page-index">${index + 1}</span>
      <span class="page-copy"><b>${escapeText(page.title)}</b><small>${nodeCount} 个节点</small></span>`;
    main.addEventListener("click", () => app.switchPage(page.id));

    const more = document.createElement("button");
    more.type = "button";
    more.className = "page-more";
    more.title = "页面操作";
    more.setAttribute("aria-label", `页面 ${page.title} 的操作`);
    more.textContent = "⋯";
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenu(more, pageMenuItems(app, page, index));
    });

    row.append(main, more);
    list.append(row);
  });
}

function pageMenuItems(app, page, index) {
  const last = app.project.pages.length - 1;
  return [
    { label: "重命名", onSelect: () => app.renamePage(page.id) },
    { label: "复制一份", onSelect: () => app.duplicatePage(page.id) },
    ...(index > 0 ? [{ label: "上移", onSelect: () => app.shiftPage(page.id, -1) }] : []),
    ...(index < last ? [{ label: "下移", onSelect: () => app.shiftPage(page.id, 1) }] : []),
    { label: "删除", danger: true, disabled: app.project.pages.length <= 1, onSelect: () => app.deletePage(page.id) },
  ];
}

/** 项目菜单：先列所有项目（当前那个打勾且不可点），再列操作。 */
export function projectMenuItems(app) {
  const entries = [...app.workspace.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const rows = entries.map((entry) =>
    entry.id === app.project.id
      ? { label: `${entry.name} · ${entry.pageCount} 页`, current: true }
      : {
          label: `${entry.name} · ${entry.pageCount} 页`,
          onSelect: () => app.switchProject(entry.id),
        },
  );
  return [
    ...rows,
    { divider: true },
    { label: "新建项目", onSelect: () => app.newProject() },
    { label: "重命名项目", onSelect: () => app.renameProject() },
    { label: "导出整个项目", onSelect: () => app.exportProject() },
    { label: "重建示例项目", onSelect: () => app.rebuildSampleProject() },
    { label: "删除项目", danger: true, onSelect: () => app.deleteProject() },
  ];
}

let menuEl = null;

export function openMenu(anchor, items) {
  closeMenu();
  menuEl = document.createElement("div");
  menuEl.className = "menu";
  menuEl.setAttribute("role", "menu");
  for (const item of items) {
    if (item.divider) {
      const sep = document.createElement("div");
      sep.className = "menu-sep";
      menuEl.append(sep);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `menu-item${item.danger ? " is-danger" : ""}${item.current ? " is-current" : ""}`;
    button.textContent = item.label;
    if (item.current) button.prepend(tick());
    if (item.disabled) {
      button.disabled = true;
      button.title = "项目至少要留一页";
    } else if (item.current) {
      button.disabled = true;
      button.title = "当前项目";
    } else {
      button.addEventListener("click", () => {
        closeMenu();
        item.onSelect();
      });
    }
    menuEl.append(button);
  }
  document.body.append(menuEl);

  const rect = anchor.getBoundingClientRect();
  const width = menuEl.offsetWidth;
  const left = Math.min(rect.left, window.innerWidth - width - 8);
  const top = rect.bottom + 6 + menuEl.offsetHeight > window.innerHeight
    ? rect.top - menuEl.offsetHeight - 6
    : rect.bottom + 6;
  menuEl.style.left = `${Math.max(8, left)}px`;
  menuEl.style.top = `${Math.max(8, top)}px`;

  window.setTimeout(() => {
    window.addEventListener("pointerdown", onOutside, { once: true });
  }, 0);
}

function onOutside(event) {
  if (menuEl && menuEl.contains(event.target)) return;
  closeMenu();
}

export function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
}

function tick() {
  const mark = document.createElement("span");
  mark.className = "menu-tick";
  mark.textContent = "✓";
  return mark;
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
