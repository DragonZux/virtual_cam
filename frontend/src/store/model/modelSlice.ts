import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { ModelInfo, ModelList } from "@/common/types";

/** Danh sách mô hình lấy từ /vision/status (tự cập nhật); slice này giữ quyền quản lý và thao tác đang chạy */
interface ModelState {
  canManage: boolean;
  folder: string | null;
  maxBytes: number | null;
  /** Tên file .pt đang tải lên / nạp */
  uploading: string | null;
  /** id mô hình đang bật tắt / xoá */
  busy: string[];
}

const initialState: ModelState = {
  canManage: false,
  folder: null,
  maxBytes: null,
  uploading: null,
  busy: [],
};

const done = (state: ModelState, id: string) => {
  state.busy = state.busy.filter((item) => item !== id);
};

const modelSlice = createSlice({
  name: "model",
  initialState,
  reducers: {
    fetchListRequest: () => {},
    fetchListSuccess: (state, action: PayloadAction<ModelList>) => {
      state.canManage = action.payload.can_manage;
      state.folder = action.payload.folder;
      state.maxBytes = action.payload.max_bytes;
    },
    fetchListFailure: (_state, _action: PayloadAction<string>) => {},

    uploadRequest: (state, action: PayloadAction<File>) => {
      state.uploading = action.payload.name;
    },
    uploadSuccess: (state, _action: PayloadAction<ModelInfo>) => {
      state.uploading = null;
    },
    uploadFailure: (state, _action: PayloadAction<string>) => {
      state.uploading = null;
    },

    setEnabledRequest: (state, action: PayloadAction<{ id: string; enabled: boolean }>) => {
      state.busy.push(action.payload.id);
    },
    setEnabledSuccess: (state, action: PayloadAction<ModelInfo>) => done(state, action.payload.id),
    setEnabledFailure: (state, action: PayloadAction<{ id: string; message: string }>) => done(state, action.payload.id),

    removeRequest: (state, action: PayloadAction<string>) => {
      state.busy.push(action.payload);
    },
    removeSuccess: (state, action: PayloadAction<string>) => done(state, action.payload),
    removeFailure: (state, action: PayloadAction<{ id: string; message: string }>) => done(state, action.payload.id),
  },
});

export const modelActions = modelSlice.actions;
export const modelReducer = modelSlice.reducer;
