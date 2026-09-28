import i18next from "i18next";
import { filter, ignoreElements, tap } from "rxjs/operators";

import { objectLabel } from "@/utils/format";
import { speak, speechLang } from "@/utils/speech";
import type { RootEpic } from "../types";
import { historyActions } from "./historySlice";

/** Đọc tên vật thể mỗi khi có lượt chọn mới (bật ở Cài đặt › Âm thanh) */
const announce$: RootEpic = (action$, state$) =>
  action$.pipe(
    filter(historyActions.addSelection.match),
    filter(() => state$.value.setting.prefs.voice),
    tap(({ payload }) => speak(objectLabel(i18next.t, payload.name), speechLang(i18next.language))),
    ignoreElements(),
  );

export const historyEpics = [announce$];
