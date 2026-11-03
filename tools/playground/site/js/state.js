// 会话状态：当前语言、当前条目、当前文件与草稿。
// 草稿按「语言/条目/文件」落在本机，换设备不同步（云同步尚未接入）。

const KEY = "playground/v1";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function draftKey(languageId, entryId, fileId) {
  return `${languageId}/${entryId}/${fileId}`;
}

export function createState() {
  const saved = read();
  const state = {
    languageId: saved.languageId ?? "ts",
    entryId: saved.entryId ?? null,
    fileIds: saved.fileIds ?? {},
    drafts: saved.drafts ?? {},
  };

  state.persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        languageId: state.languageId,
        entryId: state.entryId,
        fileIds: state.fileIds,
        drafts: state.drafts,
      }));
    } catch {
      // 隐私模式下写不进去，不影响本次会话
    }
  };

  state.readFile = (entry, file) =>
    state.drafts[draftKey(state.languageId, entry.id, file.id)] ?? file.content;

  state.isDirty = (entry, file) =>
    state.drafts[draftKey(state.languageId, entry.id, file.id)] !== undefined;

  state.clearDrafts = () => {
    state.drafts = {};
    state.persist();
  };

  return state;
}
