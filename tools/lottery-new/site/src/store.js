/**
 * 本机存储。
 *
 * 数据只在本机：池、抽奖设置与账本一起存。云同步要声明 capabilities 并
 * 经壳转发，这里不碰；拿不到云就一直是本机，界面上说明"未同步"。
 */

const KEY = 'lottery-new:state.v1';

function emptyState() {
  return { pools: [], draws: [], rounds: [], currentDrawId: null };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return { ...emptyState(), ...parsed };
  } catch (error) {
    return emptyState();
  }
}

export function createStore() {
  let state = load();
  const listeners = new Set();

  function emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      // 写不进去不影响这一轮的使用，下次打开会回到上次存下的样子。
    }
    for (const listener of listeners) listener(state);
  }

  return {
    get state() {
      return state;
    },
    update(mutate) {
      state = mutate(state) ?? state;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
