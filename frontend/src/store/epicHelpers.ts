import type { Action, PayloadAction } from "@reduxjs/toolkit";
import { concat, of, type Observable } from "rxjs";
import { catchError, filter, map, mergeMap, switchMap } from "rxjs/operators";
import type { AjaxError } from "rxjs/ajax";

import { extractApiErrorMessage } from "@/Services/HttpClient";
import { startLoading, stopLoading } from "./loading";
import type { RootEpic, RootState } from "./types";

type Matcher<P> = { match: (action: Action) => action is PayloadAction<P> };

export interface RequestEpicOptions<P = unknown> {
  /** key hiển thị loading (hoặc hàm theo payload, vd. loading theo từng dòng); bỏ trống = không phát start/stopLoading */
  key?: string | ((payload: P) => string);
  /** switch (mặc định, huỷ request cũ) hoặc merge (chạy song song, dùng cho thao tác ghi) */
  mode?: "switch" | "merge";
}

export const errorMessage = (err: unknown): string =>
  extractApiErrorMessage(err as AjaxError) ?? (err as { message?: string })?.message ?? "Request failed";

/**
 * Tạo epic chuẩn: request → gọi service → success | failure, bọc start/stopLoading.
 * Giữ nguyên pattern *Request/*Success/*Failure của slice, chỉ bớt lặp code.
 */
export const requestEpic =
  <P, R>(
    request: Matcher<P>,
    call: (payload: P, state: RootState) => Observable<R>,
    onSuccess: (result: R, payload: P) => Action | Action[],
    onFailure: (message: string, payload: P, error: unknown) => Action,
    options: RequestEpicOptions<P> = {},
  ): RootEpic =>
  (action$, state$) => {
    const project = (action: PayloadAction<P>) => {
      const work$ = call(action.payload, state$.value).pipe(
        mergeMap((result) => {
          const out = onSuccess(result, action.payload);
          return of(...(Array.isArray(out) ? out : [out]));
        }),
        catchError((err) => of(onFailure(errorMessage(err), action.payload, err))),
      );
      const key = typeof options.key === "function" ? options.key(action.payload) : options.key;
      return key ? concat(of(startLoading({ key })), work$, of(stopLoading({ key }))) : work$;
    };
    const op = options.mode === "merge" ? mergeMap : switchMap;
    return action$.pipe(filter(request.match), op(project), map((a) => a as Action));
  };
