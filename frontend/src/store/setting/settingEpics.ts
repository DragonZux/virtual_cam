import { filter, ignoreElements, tap } from "rxjs/operators";

import { savePreferences } from "@/utils/preferences";
import type { RootEpic } from "../types";
import { settingActions } from "./settingSlice";

/** Lưu cài đặt vào localStorage sau mỗi thay đổi (epic chạy sau reducer nên state$ đã là bản mới) */
const persist$: RootEpic = (action$, state$) =>
  action$.pipe(
    filter((action) => settingActions.updatePreferences.match(action) || settingActions.resetPreferences.match(action)),
    tap(() => savePreferences(state$.value.setting.prefs)),
    ignoreElements(),
  );

export const settingEpics = [persist$];
