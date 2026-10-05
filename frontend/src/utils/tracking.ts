import type { SelectedObject } from "@/common/types";

/**
 * Vật thể đang chỉ qua nhiều khung (máy chủ tính, services/live_tracking.py):
 * - `pending`: chấm laser vừa chạm vật thể, đang đếm thời gian giữ (dwell) để xác nhận.
 * - `held`: vật thể đã xác nhận; máy chủ giữ thêm một chút sau khi chấm rời đi để tên không nhấp nháy.
 */
export interface Tracking {
  held: SelectedObject | null;
  heldAt: number;
  /** `since` theo giờ trình duyệt (lúc nhận kết quả trừ thời gian máy chủ báo đã giữ) */
  pending: { name: string; since: number } | null;
}

export const EMPTY_TRACKING: Tracking = { held: null, heldAt: 0, pending: null };

/** 0..1 — vòng tiến độ quanh chấm laser */
export const dwellProgress = (tracking: Tracking, dwellMs: number, now: number): number => {
  if (tracking.pending) return dwellMs > 0 ? Math.min(1, (now - tracking.pending.since) / dwellMs) : 1;
  return tracking.held ? 1 : 0;
};
