/** React 绑定：store 本身不 import React（04 §4 依赖方向），钩子放在 ui/ 这一层。 */
import { useSyncExternalStore } from 'react';
import { getDocState, subscribeDoc, type DocState } from '../store/docStore.ts';
import { getUiState, subscribeUi, type UiState } from '../store/uiStore.ts';

export function useDoc(): DocState {
  return useSyncExternalStore(subscribeDoc, getDocState, getDocState);
}

export function useUi(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiState);
}
