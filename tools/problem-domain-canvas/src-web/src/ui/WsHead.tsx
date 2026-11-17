import { useDoc } from './useStores.ts';
import { DomainSwitch } from './DomainSwitch.tsx';

/** 左列顶部行（02 §3 组件 9 / 03 §2.2）：工作区名 + 域切换，只有这两样，高 40。 */
export function WsHead() {
  const doc = useDoc();
  return (
    <div className="left-hd">
      <span className="ws-name" title={doc.ws.name}>
        {doc.ws.name}
      </span>
      <DomainSwitch />
    </div>
  );
}
