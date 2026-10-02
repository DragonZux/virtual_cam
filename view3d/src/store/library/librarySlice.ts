import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CustomModel } from "@/common/types";

/** Mô hình GLB riêng trong public/models/manifest.json; không có / lỗi thì chỉ dùng mô hình dựng sẵn */
interface LibraryState {
  custom: Record<string, CustomModel>;
  status: "idle" | "loading" | "ready" | "error";
}

const initialState: LibraryState = { custom: {}, status: "idle" };

const librarySlice = createSlice({
  name: "library",
  initialState,
  reducers: {
    loadRequest: (state) => {
      state.status = "loading";
    },
    loadSuccess: (state, action: PayloadAction<Record<string, CustomModel>>) => {
      state.custom = action.payload;
      state.status = "ready";
    },
    loadFailure: (state) => {
      state.custom = {};
      state.status = "error";
    },
  },
});

export const libraryActions = librarySlice.actions;
export const libraryReducer = librarySlice.reducer;
