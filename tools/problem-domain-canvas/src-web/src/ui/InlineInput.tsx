import { useEffect, useRef } from 'react';

/**
 * 行内输入（01 §7.1 / 03 §2.7）：挂上即聚焦并全选；
 * Enter 提交、Esc 取消、失焦按提交处理（空标题由调用方丢弃）。
 */
export function InlineInput(props: {
  initial: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  return (
    <input
      ref={ref}
      className="inline-input"
      defaultValue={props.initial}
      placeholder={props.placeholder ?? '新建问题…'}
      aria-label="问题标题"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          settled.current = true;
          props.onCommit(event.currentTarget.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          settled.current = true;
          props.onCancel();
        }
        event.stopPropagation();
      }}
      onBlur={(event) => {
        if (settled.current) return;
        settled.current = true;
        props.onCommit(event.currentTarget.value);
      }}
    />
  );
}
