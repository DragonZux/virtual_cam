import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface LoadingState {
  loading: boolean;
  /** số request đang chạy theo key — hai request cùng key chạy song song thì key chỉ tắt khi cả hai xong */
  activeLoadings: Record<string, number>;
}

const initialState: LoadingState = { loading: false, activeLoadings: {} };

const loadingSlice = createSlice({
  name: "loading",
  initialState,
  reducers: {
    startLoading: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      state.activeLoadings[key] = (state.activeLoadings[key] ?? 0) + 1;
      state.loading = true;
    },
    stopLoading: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      const left = (state.activeLoadings[key] ?? 0) - 1;
      if (left > 0) state.activeLoadings[key] = left;
      else delete state.activeLoadings[key];
      state.loading = Object.keys(state.activeLoadings).length > 0;
    },
    clearLoading: (state) => {
      state.activeLoadings = {};
      state.loading = false;
    },
  },
});

export const { startLoading, stopLoading, clearLoading } = loadingSlice.actions;
export const loadingReducer = loadingSlice.reducer;
