import { useCallback, useEffect, useState } from "react";

/** Toàn màn hình cả trang (ngăn cài đặt / danh sách chọn của antd vẫn hiện); `toggle` trả false nếu không hỗ trợ */
export const useFullscreen = () => {
  const [active, setActive] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const update = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return true;
      }
      if (!document.documentElement.requestFullscreen) return false;
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  return { active, toggle };
};
