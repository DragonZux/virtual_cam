import { createSelector } from "@reduxjs/toolkit";

import type { FrameOptions } from "@/common/types";
import type { RootState } from "@/store/types";
import { classKey } from "@/utils/format";
import { getVisionStatus } from "../vision/visionSelector";

export const getPreferences = (state: RootState) => state.setting.prefs;

/**
 * Vật thể đang nhận diện: lựa chọn của trình duyệt (bỏ lớp máy chủ không còn) hoặc mặc định máy chủ.
 * Tên so không phân biệt hoa / thường như máy chủ: "laptop" đã lưu vẫn khớp "Laptop" khi chỉ còn mô hình khác.
 */
export const getActiveTargets = createSelector([getPreferences, getVisionStatus], (prefs, status): string[] => {
  if (!status) return prefs.targets ?? [];
  const byKey = new Map(status.classes.map((name) => [classKey(name), name]));
  const chosen = new Set((prefs.targets ?? []).flatMap((name) => byKey.get(classKey(name)) ?? []));
  return chosen.size ? [...chosen] : status.defaults.targets;
});

/** Tham số gửi kèm từng khung; null khi chưa biết mặc định của máy chủ */
export const getFrameOptions = createSelector(
  [getPreferences, getVisionStatus, getActiveTargets],
  (prefs, status, targets): FrameOptions | null =>
    status?.phase === "ready"
      ? {
          pointer_mode: prefs.pointerMode,
          model_revision: status.model_revision,
          targets,
          conf: prefs.confidence ?? status.defaults.confidence,
          tolerance: prefs.tolerance ?? status.defaults.tolerance,
        }
      : null,
);
