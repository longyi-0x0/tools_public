/** 三条生成管线的统一返回（04 §2.2）：纯文本 + 文件名 + 降级说明，不碰 DOM / 时钟 / 随机。 */
export interface ExportArtifact {
  text: string;
  /** `{工作区名}-model.ts` 这类，不含日期戳（日期由 UI 层拼，保证纯函数幂等）。 */
  fileName: string;
  warnings: string[];
}
