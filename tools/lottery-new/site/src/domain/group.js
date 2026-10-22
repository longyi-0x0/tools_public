/**
 * 组。
 *
 * 组不是文件夹，是一层去重范围：同组即「中过就不能再中」共享同一片用量。
 * 一个抽奖至多属于一个组，也可以不属于任何组——那时组作用域退化为本场。
 */

import { makeId } from './ids.js';

export function createGroup({ id, name = '' } = {}) {
  return { id: id ?? makeId('g'), name };
}

export function indexGroups(groups = []) {
  return Object.fromEntries(groups.map((group) => [group.id, group]));
}

export function groupNameOf(groups, groupId) {
  if (!groupId) return '';
  return (groups ?? []).find((group) => group.id === groupId)?.name ?? '';
}
