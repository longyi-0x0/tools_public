/**
 * 结果到人话。
 *
 * 账本里只存 id，显示时才去池里取名字；条目被删了就显示"（已删除）"，
 * 历史记录不会因为条目没了就断掉。
 */

export function labelOf(pools, pick) {
  const entry = pools[pick.poolId]?.entries.find((item) => item.id === pick.entryId);
  return entry?.label || '（已删除）';
}

export function resultTextOf(round, pools) {
  if (!round.win || round.picks.length === 0) return '未中奖';
  return round.picks.map((pick) => labelOf(pools, pick)).join(' · ');
}

export function timeOf(timestamp) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
