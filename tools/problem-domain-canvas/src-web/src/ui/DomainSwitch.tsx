import { setDomain } from '../store/commands.ts';
import { useUi } from './useStores.ts';

/** 左列顶部行的域切换（03 §2.2）：解域本轮只换胶囊选中态 + 占位屏，没有功能。 */
export function DomainSwitch() {
  const ui = useUi();
  return (
    <div className="dom-switch" role="tablist" aria-label="域切换">
      <button
        type="button"
        role="tab"
        aria-selected={ui.domain === 'problem'}
        data-on={ui.domain === 'problem'}
        onClick={() => setDomain('problem')}
      >
        问题域
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={ui.domain === 'solve'}
        data-on={ui.domain === 'solve'}
        onClick={() => setDomain('solve')}
      >
        解域
      </button>
    </div>
  );
}
