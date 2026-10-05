import { distinctUntilChanged, filter, map, skip } from "rxjs/operators";

import type { RootEpic } from "../types";
import { viewerActions } from "./viewerSlice";

/** Có vật thể mới được chọn trên camera → thôi xem thử, màn hình theo camera (trừ ?preview= mở sẵn) */
const backToLive$: RootEpic = (_action$, state$) =>
  state$.pipe(
    map((state) => state.stream.revision),
    distinctUntilChanged(),
    skip(1),
    filter(() => state$.value.viewer.preview?.sticky === false),
    map(() => viewerActions.setPreview(null)),
  );

export const viewerEpics = [backToLive$];
