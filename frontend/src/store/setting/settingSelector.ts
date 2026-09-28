import { createSelector } from "@reduxjs/toolkit";

import type { FrameOptions } from "@/common/types";
import type { RootState } from "@/store/types";
import { getVisionStatus } from "../vision/visionSelector";

export const getPreferences = (state: RootState) => state.setting.prefs;

/** Vật thể đang nhận diện: lựa chọn của trình duyệt (bỏ lớp máy chủ không còn) hoặc mặc định máy chủ */
export const getActiveTargets = createSelector([getPreferences, getVisionStatus], (prefs, status): string[] => {
  if (!status) return prefs.targets ?? [];
  const allowed = new Set(status.classes);
  const chosen = (prefs.targets ?? []).filter((name) => allowed.has(name));
  return chosen.length ? chosen : status.defaults.targets;
});

/** Tham số gửi kèm từng khung; null khi chưa biết mặc định của máy chủ */
export const getFrameOptions = createSelector(
  [getPreferences, getVisionStatus, getActiveTargets],
  (prefs, status, targets): FrameOptions | null =>
    status?.phase === "ready"
      ? {
          pointer_mode: prefs.pointerMode,
          laser_color: prefs.laserColor,
          laser_brightness: prefs.laserBrightness,
          targets,
          conf: prefs.confidence ?? status.defaults.confidence,
          tolerance: prefs.tolerance ?? status.defaults.tolerance,
        }
      : null,
);
