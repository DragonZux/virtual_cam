import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { DEFAULT_PREFERENCES } from "@/common/constants";
import type { ViewerPreferences } from "@/common/types";
import { loadPreferences } from "@/utils/preferences";

/** Cài đặt riêng của trình duyệt này; settingEpics lưu vào localStorage sau mỗi thay đổi */
interface SettingState {
  prefs: ViewerPreferences;
}

const initialState: SettingState = { prefs: loadPreferences() };

const settingSlice = createSlice({
  name: "setting",
  initialState,
  reducers: {
    updatePreferences: (state, action: PayloadAction<Partial<ViewerPreferences>>) => {
      state.prefs = { ...state.prefs, ...action.payload };
    },
    resetPreferences: (state) => {
      state.prefs = { ...DEFAULT_PREFERENCES };
    },
  },
});

export const settingActions = settingSlice.actions;
export const settingReducer = settingSlice.reducer;
