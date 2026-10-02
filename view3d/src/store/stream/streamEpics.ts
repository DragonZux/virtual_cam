import { of } from "rxjs";
import { distinctUntilChanged, filter, map, switchMap, takeUntil } from "rxjs/operators";

import type { StreamSignal } from "@/common/types";
import { SelectionStreamService } from "@/Services/SelectionStreamService";
import type { RootEpic } from "../types";
import { streamActions } from "./streamSlice";
import { getWsUrl } from "./streamSelector";

const toAction = (signal: StreamSignal) => {
  switch (signal.kind) {
    case "connecting":
      return streamActions.connecting(signal.url);
    case "open":
      return streamActions.opened();
    case "closed":
      return streamActions.closed(signal.retryInMs);
    case "message":
      return streamActions.messageReceived(signal.message);
  }
};

/** Nghe WebSocket tới khi dừng; đổi địa chỉ (Cài đặt / ?ws=) thì đóng kết nối cũ và nối địa chỉ mới */
const watch$: RootEpic = (action$, state$) =>
  action$.pipe(
    filter(streamActions.start.match),
    switchMap(() =>
      state$.pipe(
        map(getWsUrl),
        distinctUntilChanged(),
        switchMap((url) => (url ? SelectionStreamService.watch(url).pipe(map(toAction)) : of(streamActions.invalidUrl()))),
        takeUntil(action$.pipe(filter(streamActions.stop.match))),
      ),
    ),
  );

export const streamEpics = [watch$];
