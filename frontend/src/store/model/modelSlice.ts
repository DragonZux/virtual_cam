import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ModelKind, ModelList } from "@/common/types";

type Mutation = "upload";

interface ModelState {
  catalog: ModelList | null;
  loading: boolean;
  busy: Mutation | null;
  error: string | null;
  success: Mutation | null;
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
    /** convert: tải xong thì chuyển sang TensorRT FP16 (máy chủ tự chọn engine khi xong) */
    uploadRequest: (state, _action: PayloadAction<{ kind: ModelKind; file: File; convert: boolean }>) => {
      state.busy = "upload"; state.error = null; state.success = null;
    },
    mutationSuccess: (state, action: PayloadAction<Mutation>) => {
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
