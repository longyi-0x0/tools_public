/** 名字兜底。空名字在界面上一律有个说得过去的叫法，不显示空白。 */

export function nameOf(item, fallback = '未命名') {
  return item?.name || fallback;
}
