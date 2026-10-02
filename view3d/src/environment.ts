/** WebSocket đặt lúc build (VITE_WS_URL). Để trống → /api/vision/ws cùng máy chủ đã mở trang (dev / preview: vite proxy). */
export const ENV_WS_URL: string = (import.meta.env.VITE_WS_URL as string | undefined)?.trim() || "";
