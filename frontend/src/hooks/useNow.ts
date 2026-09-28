import { useEffect, useState } from "react";

/** Thời điểm hiện tại, cập nhật mỗi `intervalMs` (đồng hồ phiên) */
export const useNow = (intervalMs = 1000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
};
