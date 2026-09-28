import { useEffect, useState } from "react";

/** false khi tab bị ẩn / thu nhỏ — lúc đó ngừng gửi khung để nhường máy chủ cho người khác */
export const useDocumentVisible = (): boolean => {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
};
