import { HOLD_MS } from "@/common/constants";
import type { SelectedObject } from "@/common/types";

/**
 * Theo dõi vật thể đang chỉ qua nhiều khung:
 * - `pending`: ngón tay vừa chạm vật thể, đang đếm thời gian giữ (dwell) để xác nhận.
 * - `held`: vật thể đã xác nhận; giữ thêm HOLD_MS sau khi ngón tay rời đi để tên không nhấp nháy.
 */
export interface Tracking {
  held: SelectedObject | null;
  heldAt: number;
  pending: { name: string; since: number } | null;
}

export const EMPTY_TRACKING: Tracking = { held: null, heldAt: 0, pending: null };

export interface TrackingStep {
  tracking: Tracking;
  /** Vật thể vừa được xác nhận ở khung này → ghi một lượt chọn */
  confirmed: SelectedObject | null;
}

export const advanceTracking = (
  prev: Tracking,
  selected: SelectedObject | null,
  now: number,
  dwellMs: number,
): TrackingStep => {
  if (selected && prev.held?.name === selected.name) {
    return { tracking: { held: selected, heldAt: now, pending: null }, confirmed: null };
  }
  const pending = selected
    ? prev.pending?.name === selected.name
      ? prev.pending
      : { name: selected.name, since: now }
    : null;
  if (selected && pending && now - pending.since >= dwellMs) {
    return { tracking: { held: selected, heldAt: now, pending: null }, confirmed: selected };
  }
  const keep = prev.held !== null && now - prev.heldAt <= HOLD_MS;
  return { tracking: { held: keep ? prev.held : null, heldAt: keep ? prev.heldAt : 0, pending }, confirmed: null };
};

/** 0..1 — vòng tiến độ quanh đầu ngón trỏ */
export const dwellProgress = (tracking: Tracking, dwellMs: number, now: number): number => {
  if (tracking.pending) return dwellMs > 0 ? Math.min(1, (now - tracking.pending.since) / dwellMs) : 1;
  return tracking.held ? 1 : 0;
};
