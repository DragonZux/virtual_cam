/** URL gốc của API. Để trống → "/api" (dev: vite proxy, prod: nginx proxy). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "/api";

export const APP_VERSION: string = import.meta.env.APP_VERSION ?? "0.0.0";
