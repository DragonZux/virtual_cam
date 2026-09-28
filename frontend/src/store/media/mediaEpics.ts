import i18next from "i18next";
import { filter, ignoreElements, tap } from "rxjs/operators";

import { MediaService } from "@/Services/MediaService";
import { notify } from "@/utils/notify";
import { requestEpic } from "../epicHelpers";
import type { RootEpic } from "../types";
import { mediaActions } from "./mediaSlice";

const fetchList$ = requestEpic(
  mediaActions.fetchListRequest,
  () => MediaService.Get.list(),
  (result) => mediaActions.fetchListSuccess(result),
  (message) => mediaActions.fetchListFailure(message),
);

/** Tải lên lần lượt từng file (merge: chọn file mới không huỷ file đang lưu) */
const upload$ = requestEpic(
  mediaActions.uploadRequest,
  (file) => MediaService.Post.upload(file),
  (item) => mediaActions.uploadSuccess(item),
  (message) => mediaActions.uploadFailure(message),
  { mode: "merge" },
);

const uploaded$: RootEpic = (action$, state$) =>
  action$.pipe(
    filter(mediaActions.uploadSuccess.match),
    tap(({ payload }) =>
      notify.success(i18next.t("media.saved", { name: payload.name, folder: state$.value.media.folder ?? "" })),
    ),
    ignoreElements(),
  );

export const mediaEpics = [fetchList$, upload$, uploaded$];
