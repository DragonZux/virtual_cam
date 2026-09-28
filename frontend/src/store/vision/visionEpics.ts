import type { Action } from "@reduxjs/toolkit";
import { of, timer } from "rxjs";
import type { AjaxError } from "rxjs/ajax";
import { catchError, exhaustMap, filter, map, mergeMap, switchMap, takeUntil } from "rxjs/operators";

import { STATUS_POLL_MS } from "@/common/constants";
import { VisionService } from "@/Services/VisionService";
import { advanceTracking } from "@/utils/tracking";
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
 * Gửi khung song song tối đa MAX_FRAMES_IN_FLIGHT (useFrameLoop giới hạn số khung đang bay);
 * kết quả về lệch thứ tự thì bỏ khung cũ hơn khung đang hiển thị.
 */
const analyzeFrame$: RootEpic = (action$, state$) => {
  const stop$ = action$.pipe(filter(stopsFrames));
  const isStale = (id: number) => id <= state$.value.vision.lastFrameId;
  return action$.pipe(
    filter(visionActions.analyzeFrameRequest.match),
    mergeMap(({ payload: { id, image, options, capturedAt } }) =>
      VisionService.Post.frame(image, options).pipe(
        mergeMap((result) => {
          if (isStale(id)) return of(visionActions.analyzeFrameSkipped());
          const at = Date.now();
          const { vision, setting } = state$.value;
          // A mode/colour change may precede the capture effect's cleanup.
          if (options.pointer_mode !== setting.prefs.pointerMode ||
              options.laser_color !== setting.prefs.laserColor ||
              options.laser_brightness !== setting.prefs.laserBrightness) {
            return of(visionActions.analyzeFrameSkipped());
          }
          const step = advanceTracking(vision.tracking, result.selected, at, setting.prefs.dwellMs);
          const out: Action[] = [visionActions.analyzeFrameSuccess({ id, result, tracking: step.tracking, at, capturedAt })];
          if (step.confirmed) {
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
