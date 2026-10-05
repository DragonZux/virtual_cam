import type { ModelKind, Preferences } from "./types";

export const ROUTES = {
  live: "/",
  settings: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Mỗi loại chạy một mô hình (Cài đặt › Quản lý mô hình AI) */
export const MODEL_KINDS: ModelKind[] = ["segmentation", "laser"];

/** Cạnh dài khung hiển thị / ảnh chụp (bằng khung máy chủ gửi về) */
export const DISPLAY_MAX_SIDE = 1280;
export const STATUS_POLL_MS = 3000;

export const DEFAULT_PREFERENCES: Preferences = {
  dwellMs: 300,
  showOutline: true,
  showBoxes: true,
  mirror: false,
};

/** Giới hạn thanh trượt ở Cài đặt — nằm trong ràng buộc Query của backend */
export const CONFIDENCE_RANGE = { min: 0.05, max: 0.9, step: 0.05 };
export const DWELL_RANGE = { min: 0, max: 1500, step: 50 };

