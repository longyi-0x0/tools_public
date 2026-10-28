export function el(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function tokenOptions(selected, tokens, labels) {
  return tokens
    .map(
      (token) =>
        `<option value="${escapeHtml(token)}"${token === selected ? " selected" : ""}>${escapeHtml(labels[token] ?? token)}</option>`,
    )
    .join("");
}

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
