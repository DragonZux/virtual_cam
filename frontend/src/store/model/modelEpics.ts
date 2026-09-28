import i18next from "i18next";
import { filter, ignoreElements, tap } from "rxjs/operators";

import { ModelService } from "@/Services/ModelService";
import { notify } from "@/utils/notify";
import { requestEpic } from "../epicHelpers";
import type { RootEpic } from "../types";
import { visionActions } from "../vision/visionSlice";
import { modelActions } from "./modelSlice";

const fetchList$ = requestEpic(
  modelActions.fetchListRequest,
  () => ModelService.Get.list(),
  (result) => modelActions.fetchListSuccess(result),
  (message) => modelActions.fetchListFailure(message),
);

// Sau mỗi thay đổi hỏi lại /vision/status ngay (startStatusPolling khởi động lại nhịp hỏi) để danh sách vật thể
// ở Cài đặt / Tổng quan cập nhật tức thì thay vì chờ tới lượt hỏi kế tiếp
const upload$ = requestEpic(
  modelActions.uploadRequest,
  (file) => ModelService.Post.upload(file),
  (item) => [modelActions.uploadSuccess(item), visionActions.startStatusPolling()],
  (message) => modelActions.uploadFailure(message),
  { mode: "merge" },
);

const setEnabled$ = requestEpic(
  modelActions.setEnabledRequest,
  ({ id, enabled }) => ModelService.Patch.enabled(id, enabled),
  (item) => [modelActions.setEnabledSuccess(item), visionActions.startStatusPolling()],
  (message, { id }) => modelActions.setEnabledFailure({ id, message }),
  { mode: "merge" },
);

const remove$ = requestEpic(
  modelActions.removeRequest,
  (id) => ModelService.Delete.remove(id),
  (_result, id) => [modelActions.removeSuccess(id), visionActions.startStatusPolling()],
  (message, id) => modelActions.removeFailure({ id, message }),
  { mode: "merge" },
);

const uploaded$: RootEpic = (action$) =>
  action$.pipe(
    filter(modelActions.uploadSuccess.match),
    tap(({ payload }) => notify.success(i18next.t("settings.models.added", { name: payload.id, count: payload.classes.length }))),
    ignoreElements(),
  );

export const modelEpics = [fetchList$, upload$, setEnabled$, remove$, uploaded$];
