/**
 * 组 = 一场活动。
 *
 * 组不是文件夹，是一层去重范围：同一场活动的各环节共享同一片用量，中过三等奖的
 * 人不会再进二等奖的候选。一个环节至多属于一场活动，也可以不属于——那时
 * 「本场活动不重复」退化为「本环节不重复」。
 *
 * 界面上一律叫「活动」，环节挂在活动下面。`at` 是活动日期，纯展示。
 */

import { makeId } from './ids.js';

export function createGroup({ id, name = '', at = '' } = {}) {
  return { id: id ?? makeId('g'), name, at: String(at ?? '').trim() };
}

export function indexGroups(groups = []) {
  return Object.fromEntries(groups.map((group) => [group.id, group]));
}

export function groupNameOf(groups, groupId) {
  if (!groupId) return '';
  return (groups ?? []).find((group) => group.id === groupId)?.name ?? '';
}
