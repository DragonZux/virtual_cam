import { of, timer } from "rxjs";
import { catchError, exhaustMap, filter, map, switchMap, takeUntil } from "rxjs/operators";

import { STATUS_POLL_MS } from "@/common/constants";
import { VisionService } from "@/Services/VisionService";
import { errorMessage } from "../epicHelpers";
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

// Hình và kết quả nhận diện đến qua WebSocket camera (hooks/useCamera.ts); vật đã xác nhận máy chủ tự phát cho view3d
export const visionEpics = [statusPolling$];
