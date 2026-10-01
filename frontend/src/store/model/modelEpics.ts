import type { Action } from "@reduxjs/toolkit";
import { concat, of, type Observable } from "rxjs";
import { catchError, exhaustMap, filter, mergeMap } from "rxjs/operators";
import { ModelService } from "@/Services/ModelService";
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
        ? ModelService.upload(action.payload.kind, action.payload.file).pipe(mergeMap((list) => of(
          modelActions.listSuccess(list), modelActions.mutationSuccess("upload"),
        ))) : of();
    return concat(
      of(visionActions.stopStatusPolling(), visionActions.cancelFrames()),
      operation.pipe(catchError((err) => of(modelActions.mutationFailure(errorMessage(err))))),
      of(visionActions.startStatusPolling()),
    );
  }),
);
export const modelEpics = [list$, refresh$, mutate$];
