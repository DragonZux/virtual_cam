import type { Action } from "@reduxjs/toolkit";
import i18next from "i18next";
import { concat, of, type Observable } from "rxjs";
import { catchError, exhaustMap, filter, ignoreElements, map, mergeMap, pairwise, tap } from "rxjs/operators";
import { ModelService } from "@/Services/ModelService";
import { notify } from "@/utils/notify";
import { errorMessage, requestEpic } from "../epicHelpers";
import type { RootEpic } from "../types";
import { visionActions } from "../vision";
import { modelActions } from "./modelSlice";

const list$ = requestEpic(modelActions.listRequest, ModelService.list, modelActions.listSuccess, modelActions.listFailure);
const refresh$: RootEpic = (action$) => action$.pipe(
  filter(visionActions.getStatusSuccess.match),
  mergeMap(() => of(modelActions.listRequest())),
);
// Tải lên = máy chủ dùng ngay mô hình mới: dừng gửi khung trong lúc nạp, xong thì hỏi lại trạng thái (model_revision mới)
const upload$: RootEpic = (action$) => action$.pipe(
  filter(modelActions.uploadRequest.match),
  exhaustMap((action) => {
    const operation: Observable<Action> = ModelService.upload(action.payload.kind, action.payload.file, action.payload.convert)
      .pipe(mergeMap((list) => of(modelActions.listSuccess(list), modelActions.mutationSuccess("upload"))));
    return concat(
      of(visionActions.stopStatusPolling(), visionActions.cancelFrames()),
      operation.pipe(catchError((err) => of(modelActions.mutationFailure(errorMessage(err))))),
      of(visionActions.startStatusPolling()),
    );
  }),
);
// Báo một lần khi lượt chuyển đang chạy kết thúc (người dùng có thể đang ở trang khác)
const conversionFinished$: RootEpic = (action$) => action$.pipe(
  filter(modelActions.listSuccess.match),
  map((action) => action.payload.conversions ?? []),
  pairwise(),
  tap(([before, after]) => after.forEach((job) => {
    const previous = before.find((old) => old.id === job.id);
    if (!previous || previous.status === job.status) return;
    if (job.status === "done") notify.success(i18next.t("models.convertDone", { name: job.name }));
    if (job.status === "error") notify.error(i18next.t("models.convertFailed", { name: job.name, error: job.error ?? "" }));
  })),
  ignoreElements(),
);
export const modelEpics = [list$, refresh$, upload$, conversionFinished$];
