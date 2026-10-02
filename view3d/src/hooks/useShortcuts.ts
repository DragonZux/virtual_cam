import { useEffect, useRef } from "react";

/** Không bắt phím khi đang gõ / thao tác trên điều khiển (Space trên nút đã tự bấm nút đó) */
const INTERACTIVE = "input, textarea, select, button, a, [contenteditable='true'], [role='slider'], .ant-select";

/**
 * Phím tắt một phím (không kèm Ctrl/Alt/Meta). Khoá là `event.key` viết thường, riêng phím cách là "space".
 */
export const useShortcuts = (enabled: boolean, handlers: Record<string, () => void>) => {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if ((event.target as HTMLElement | null)?.closest?.(INTERACTIVE)) return;
      const key = event.key === " " ? "space" : event.key.toLowerCase();
      const handler = latest.current[key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
};
