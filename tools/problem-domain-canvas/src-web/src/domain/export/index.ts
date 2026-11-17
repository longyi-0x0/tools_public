/** 导出与实例化的公开入口（04 §2.2）：三条管线 + 导入校验，全部纯函数。 */
export { toJson } from './json.ts';
export { toMarkdown } from './markdown.ts';
export { toTs } from './typescript.ts';
export { toSeed } from './seed.ts';
export { fromJson, type ImportResult } from './fromJson.ts';
export { unfinished, unfinishedCommentLines, unfinishedMarkdownLines } from './header.ts';
export { describeModel } from './model.ts';
export type { ExportArtifact } from './types.ts';
