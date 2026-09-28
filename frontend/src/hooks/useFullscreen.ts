import { useCallback, useEffect, useState, type RefObject } from "react";

/** Toàn màn hình cho một phần tử; `toggle` trả false nếu trình duyệt không hỗ trợ */
export const useFullscreen = (ref: RefObject<HTMLElement | null>) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () => setActive(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return true;
    }
    if (!ref.current?.requestFullscreen) return false;
    await ref.current.requestFullscreen();
    return true;
  }, [ref]);

  return { active, toggle };
};
