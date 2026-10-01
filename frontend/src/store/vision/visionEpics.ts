import type { Action } from "@reduxjs/toolkit";
import { of, timer } from "rxjs";
import type { AjaxError } from "rxjs/ajax";
import { catchError, exhaustMap, filter, map, mergeMap, switchMap, takeUntil } from "rxjs/operators";

import { STATUS_POLL_MS } from "@/common/constants";
import { VisionService } from "@/Services/VisionService";
import type { FrameResult } from "@/common/types";
import { advanceLaser, type LaserStep } from "@/utils/laserTrack";
import { advanceTracking, type Tracking, type TrackingStep } from "@/utils/tracking";
import { errorMessage } from "../epicHelpers";
import { historyActions } from "../history/historySlice";
import type { RootEpic } from "../types";
import { visionActions } from "./visionSlice";

/** Hỏi trạng thái máy chủ định kỳ; exhaustMap để request treo vẫn kịp báo lỗi (timeout) thay vì bị huỷ */
const statusPolling$: RootEpic = (action$) =>
  action$.pipe(
    filter(visionActions.startStatusPolling.match),
    switchMap(() =>
      timer(0, STATUS_POLL_MS).pipe(
        exhaustMap(() =>
          VisionService.Get.status().pipe(
            map((res) => visionActions.getStatusSuccess(res)),
            catchError((err) => of(visionActions.getStatusFailure(errorMessage(err)))),
          ),
        ),
        takeUntil(action$.pipe(filter(visionActions.stopStatusPolling.match))),
      ),
    ),
  );

/** Hành động làm dừng luồng khung hình */
const stopsFrames = (action: Action): boolean =>
  visionActions.cancelFrames.match(action) ||
  visionActions.cameraStarting.match(action) ||
  visionActions.cameraStopped.match(action) ||
  visionActions.cameraFailed.match(action) ||
  (visionActions.setPaused.match(action) && action.payload);

/**
 * Chế độ laser: chỉ tin khung có chấm ở đúng chỗ đang bám. Khung nhiễu (chấm nhảy sang đốm sáng khác, mất chấm
 * thoáng qua) giữ nguyên chấm + vật đang hiển thị và không làm gián đoạn "giữ để xác nhận".
 */
const stabilizeLaser = (
  result: FrameResult,
  previous: FrameResult | null,
  laser: LaserStep,
  tracking: Tracking,
  advance: (selected: FrameResult["selected"]) => TrackingStep,
): { shown: FrameResult; step: TrackingStep } => {
  const point = laser.track.point;
  if (laser.accepted && point && result.laser) {
    return { shown: { ...result, laser: { ...result.laser, point: [Math.round(point[0]), Math.round(point[1])] } }, step: advance(result.selected) };
  }
  const sameSize = previous?.resolution.width === result.resolution.width && previous?.resolution.height === result.resolution.height;
  if (point && previous?.laser && sameSize) {
    return { shown: { ...previous, processing_ms: result.processing_ms }, step: { tracking, confirmed: null } };
  }
  return { shown: { ...result, laser: null, selected: null }, step: advance(null) };
};

/**
 * Gửi khung song song tối đa MAX_FRAMES_IN_FLIGHT (useFrameLoop giới hạn số khung đang bay);
 * kết quả về lệch thứ tự thì bỏ khung cũ hơn khung đang hiển thị.
 */
const analyzeFrame$: RootEpic = (action$, state$) => {
  const stop$ = action$.pipe(filter(stopsFrames));
  const isStale = (id: number) => id <= state$.value.vision.lastFrameId;
  return action$.pipe(
    filter(visionActions.analyzeFrameRequest.match),
    mergeMap(({ payload: { id, image, options, capturedAt, laserHint, singleImage } }) =>
      VisionService.Post.frame(image, options, laserHint).pipe(
        mergeMap((result) => {
          if (isStale(id)) return of(visionActions.analyzeFrameSkipped());
          const at = Date.now();
          const { vision, setting } = state$.value;
          // A mode change may precede the capture effect's cleanup.
          if (options.pointer_mode !== setting.prefs.pointerMode || options.model_revision !== vision.status?.model_revision) {
            return of(visionActions.analyzeFrameSkipped());
          }
          const advance = (selected: FrameResult["selected"]) => advanceTracking(vision.tracking, selected, at, setting.prefs.dwellMs);
          let shown = result;
          let step: TrackingStep;
          let laserTrack;
          if (singleImage) {
            // A still image has no future frames to confirm dwell or stabilize a laser point.
            step = { tracking: { held: result.selected, heldAt: at, pending: null }, confirmed: null };
          } else if (options.pointer_mode === "laser") {
            const laser = advanceLaser(vision.laserTrack, result.laser?.point ?? null,
              Math.max(result.resolution.width, result.resolution.height));
            ({ shown, step } = stabilizeLaser(result, vision.result, laser, vision.tracking, advance));
            laserTrack = laser.track;
          } else {
            step = advance(result.selected);
          }
          const out: Action[] = [
            visionActions.analyzeFrameSuccess({ id, result: shown, tracking: step.tracking, laserTrack, at, capturedAt }),
          ];
          if (step.confirmed && vision.camera.source !== "media") {
            const { name, confidence } = step.confirmed;
            out.push(historyActions.addSelection({ name, confidence, time: at, pointerMode: options.pointer_mode }));
          }
          return of(...out);
        }),
        catchError((err: AjaxError) =>
          of(
            isStale(id)
              ? visionActions.analyzeFrameSkipped()
              : visionActions.analyzeFrameFailure({
                  status: err?.status ?? 0,
                  // hết thời gian chờ: không có thông điệp từ máy chủ → giao diện hiện câu "phản hồi chậm"
                  message: err?.name === "AjaxTimeoutError" ? "" : errorMessage(err),
                }),
          ),
        ),
        // Tạm dừng / tắt camera / ẩn tab: huỷ mọi request đang chờ (RxJS ajax tự abort XHR)
        takeUntil(stop$),
      ),
    ),
  );
};

export const visionEpics = [statusPolling$, analyzeFrame$];
