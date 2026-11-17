import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { initDoc } from '../store/docStore.ts';
import { select } from '../store/commands.ts';
import type { ExportArtifact } from '../domain/export/index.ts';
import { fromJson, toJson, toMarkdown, toSeed, toTs } from '../domain/export/index.ts';
import { useDoc } from './useStores.ts';

const PREVIEW_LINES = 30;

function stamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 文件名带工作区名与日期：`选课问题域-2026-11-17-model.ts`。 */
function withDate(fileName: string, date: Date): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return `${fileName}-${stamp(date)}`;
  return `${fileName.slice(0, dot)}-${stamp(date)}${fileName.slice(dot)}`;
}

/** 浏览器 Blob + a[download]，不引第三方库、不依赖后端。 */
function download(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 右列顶部信息行右端的导出/导入入口（01 §8；三项导出 + 导入 JSON）。 */
export function ExportMenu() {
  const doc = useDoc();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ fileName: string; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const artifacts = (): ExportArtifact[] => {
    const index = doc.index;
    return [
      toJson(doc.ws),
      toMarkdown(doc.ws, index),
      toTs(doc.ws, index),
      toSeed(doc.ws, index),
    ];
  };

  const emit = (artifact: ExportArtifact): void => {
    const fileName = withDate(artifact.fileName, new Date());
    download(fileName, artifact.text);
    setMessage(`已导出 ${fileName}`);
    setOpen(false);
  };

  const emitAll = (): void => {
    const names: string[] = [];
    artifacts().forEach((artifact, position) => {
      const fileName = withDate(artifact.fileName, new Date());
      names.push(fileName);
      window.setTimeout(() => download(fileName, artifact.text), position * 150);
    });
    setMessage(`已导出 ${names.length} 个文件：${names.join('、')}`);
    setOpen(false);
  };

  const openTsPreview = (): void => {
    const artifact = toTs(doc.ws, doc.index);
    setPreview({
      fileName: withDate(artifact.fileName, new Date()),
      text: artifact.text.split('\n').slice(0, PREVIEW_LINES).join('\n'),
    });
    setOpen(false);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const text = await file.text();
    const result = fromJson(text);
    if (!result.ok) {
      setMessage(`导入失败：${result.error}`);
      return;
    }
    initDoc(result.ws, `已导入「${result.ws.name}」`);
    select(null);
    setMessage(`已导入「${result.ws.name}」：${result.ws.nodes.length} 个节点、${result.ws.edges.length} 条边`);
    setOpen(false);
  };

  return (
    <div className="export-menu">
      <button
        type="button"
        className="export-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="导出与导入"
        title="导出 / 导入"
        onClick={() => setOpen((value) => !value)}
      >
        ⤓
      </button>
      {open && (
        <div className="export-list" role="menu">
          <button type="button" role="menuitem" onClick={() => emit(toJson(doc.ws))}>
            导出 JSON
          </button>
          <button type="button" role="menuitem" onClick={() => emit(toMarkdown(doc.ws, doc.index))}>
            导出 Markdown
          </button>
          <button type="button" role="menuitem" onClick={openTsPreview}>
            导出 TypeScript…
          </button>
          <button type="button" role="menuitem" onClick={emitAll}>
            导出全部（4 个文件）
          </button>
          <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
            导入 JSON…
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void onFile(event)}
      />
      {preview && (
        <div className="export-preview" role="dialog" aria-label="导出预览">
          <div className="ep-hd">{preview.fileName} · 前 30 行</div>
          <pre className="ep-body">{preview.text}</pre>
          <div className="ep-ft">
            <button
              type="button"
              onClick={() => {
                const artifact = toTs(doc.ws, doc.index);
                setPreview(null);
                emit(artifact);
              }}
            >
              确认导出
            </button>
            <button type="button" onClick={() => setPreview(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {message && (
        <div className="export-msg" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
