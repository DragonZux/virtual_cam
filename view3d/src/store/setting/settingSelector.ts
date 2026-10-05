import type { RootState } from "@/store/types";

export const getPreferences = (state: RootState) => state.setting.prefs;
