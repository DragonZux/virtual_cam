import { of } from "rxjs";
import { catchError, filter, map, switchMap } from "rxjs/operators";

import { ModelLibraryService } from "@/Services/ModelLibraryService";
import type { RootEpic } from "../types";
import { libraryActions } from "./librarySlice";

/** Manifest là tuỳ chọn: lỗi tải chỉ làm màn hình dùng mô hình dựng sẵn, không báo lỗi */
const load$: RootEpic = (action$) =>
  action$.pipe(
    filter(libraryActions.loadRequest.match),
    switchMap(() =>
      ModelLibraryService.getCustomModels().pipe(
        map((custom) => libraryActions.loadSuccess(custom)),
        catchError(() => of(libraryActions.loadFailure())),
      ),
    ),
  );

export const libraryEpics = [load$];
