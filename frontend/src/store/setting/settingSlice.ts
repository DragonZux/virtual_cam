import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { DEFAULT_PREFERENCES } from "@/common/constants";
import type { Preferences } from "@/common/types";
import { loadPreferences } from "@/utils/preferences";

/** Cài đặt riêng của trình duyệt này; settingEpics lưu vào localStorage sau mỗi thay đổi */
interface SettingState {
  prefs: Preferences;
}

const initialState: SettingState = { prefs: loadPreferences() };

const settingSlice = createSlice({
  name: "setting",
  initialState,
  reducers: {
    /** Trường đặt undefined (targets / confidence / tolerance) = quay về mặc định máy chủ */
    updatePreferences: (state, action: PayloadAction<Partial<Preferences>>) => {
      state.prefs = { ...state.prefs, ...action.payload };
    },
    resetPreferences: (state) => {
      state.prefs = { ...DEFAULT_PREFERENCES };
    },
  },
});

export const settingActions = settingSlice.actions;
export const settingReducer = settingSlice.reducer;
