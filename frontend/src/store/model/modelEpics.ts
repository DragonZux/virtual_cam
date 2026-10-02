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
const mutate$: RootEpic = (action$) => action$.pipe(
  filter((action) => modelActions.activateRequest.match(action) || modelActions.uploadRequest.match(action)),
  exhaustMap((action) => {
    const operation: Observable<Action> = modelActions.activateRequest.match(action)
      ? ModelService.activate(action.payload).pipe(mergeMap((status) => of(
        visionActions.getStatusSuccess(status), modelActions.mutationSuccess("activate"),
      )))
      : modelActions.uploadRequest.match(action)
        ? ModelService.upload(action.payload.kind, action.payload.file, action.payload.convert).pipe(mergeMap((list) => of(
          modelActions.listSuccess(list), modelActions.mutationSuccess("upload"),
        ))) : of();
    return concat(
      of(visionActions.stopStatusPolling(), visionActions.cancelFrames()),
      operation.pipe(catchError((err) => of(modelActions.mutationFailure(errorMessage(err))))),
      of(visionActions.startStatusPolling()),
    );
  }),
);
// Chuyển đổi chạy nền: không dừng nhận diện; tiến độ về qua danh sách mô hình (làm mới cùng trạng thái mỗi 3 giây)
const convert$: RootEpic = (action$) => action$.pipe(
  filter(modelActions.convertRequest.match),
  exhaustMap((action) => ModelService.convert(action.payload).pipe(
    mergeMap((list) => of(modelActions.listSuccess(list), modelActions.mutationSuccess("convert"))),
    catchError((err) => of(modelActions.mutationFailure(errorMessage(err)))),
  )),
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
export const modelEpics = [list$, refresh$, mutate$, convert$, conversionFinished$];
