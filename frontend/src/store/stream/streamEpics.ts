import { filter, ignoreElements, tap } from "rxjs/operators";

import { saveStreamLinks } from "@/utils/stream";
import type { RootEpic } from "../types";
import { streamActions } from "./streamSlice";

/** Lưu danh sách camera RTSP vào localStorage sau mỗi thay đổi (epic chạy sau reducer nên state$ đã là bản mới) */
const persist$: RootEpic = (action$, state$) =>
  action$.pipe(
    filter((action) => streamActions.saveLink.match(action) || streamActions.removeLink.match(action)),
    tap(() => saveStreamLinks(state$.value.stream.links)),
    ignoreElements(),
  );

export const streamEpics = [persist$];
