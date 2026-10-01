import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ModelKind, ModelList } from "@/common/types";

interface ModelState {
  catalog: ModelList | null;
  loading: boolean;
  busy: "upload" | "activate" | null;
  error: string | null;
  success: "upload" | "activate" | null;
}
const initialState: ModelState = { catalog: null, loading: false, busy: null, error: null, success: null };
const slice = createSlice({
  name: "model", initialState,
  reducers: {
    listRequest: (state) => { state.loading = true; },
    listSuccess: (state, action: PayloadAction<ModelList>) => {
      state.catalog = action.payload;
      state.loading = false;
    },
    listFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      if (!state.catalog) state.error = action.payload;
    },
    uploadRequest: (state, _action: PayloadAction<{ kind: ModelKind; file: File }>) => {
      state.busy = "upload"; state.error = null; state.success = null;
    },
    activateRequest: (state, _action: PayloadAction<string>) => {
      state.busy = "activate"; state.error = null; state.success = null;
    },
    mutationSuccess: (state, action: PayloadAction<"upload" | "activate">) => {
      state.busy = null; state.error = null; state.success = action.payload;
    },
    mutationFailure: (state, action: PayloadAction<string>) => {
      state.busy = null; state.error = action.payload;
    },
    dismiss: (state) => { state.error = null; state.success = null; },
  },
});
export const modelActions = slice.actions;
export const modelReducer = slice.reducer;
