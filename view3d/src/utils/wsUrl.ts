import { WS_PATH } from "@/common/constants";

type PageLocation = Pick<Location, "protocol" | "host">;

/** Máy chủ đã mở trang: dev / preview đi qua vite proxy, Docker là chính backend (/view3d/) */
export const sameOriginWsUrl = (page: PageLocation): string =>
  `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}${WS_PATH}`;

/**
 * Địa chỉ WebSocket từ ?ws= / ô Cài đặt / VITE_WS_URL:
 * - trống → cùng máy chủ đã mở trang;
 * - "https://10.0.10.62:8033" hoặc "wss://10.0.10.62:8033" → thêm /api/vision/ws khi thiếu đường dẫn;
 * - "10.0.10.62:8033" (không ghi giao thức) → wss:// vì máy chủ Docker / Jetson chỉ mở HTTPS.
 * Trả null nếu không phải địa chỉ ws(s) / http(s) hợp lệ.
 */
export const resolveWsUrl = (input: string, page: PageLocation): string | null => {
  const value = input.trim();
  if (!value) return sameOriginWsUrl(page);
  if (value.startsWith("/")) return `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}${value}`;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `wss://${value}`);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  if (url.pathname === "/") url.pathname = WS_PATH;
  url.hash = "";
  return url.href;
};

/** Trang HTTPS để chấp nhận chứng chỉ tự ký của máy chủ WebSocket (wss://host → https://host/) */
export const certificatePageOf = (wsUrl: string): string | null => {
  try {
    const url = new URL(wsUrl);
    return url.protocol === "wss:" ? `https://${url.host}/` : null;
  } catch {
    return null;
  }
};
