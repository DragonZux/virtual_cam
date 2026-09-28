import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { MediaItem, MediaList } from "@/common/types";

interface MediaState {
  items: MediaItem[];
  /** Thư mục lưu trên máy chủ — null khi chưa hỏi được */
  folder: string | null;
  maxBytes: number | null;
  /** Tên file đang tải lên (null = không có) */
  uploading: string | null;
}

const initialState: MediaState = {
  items: [],
  folder: null,
  maxBytes: null,
  uploading: null,
};

const mediaSlice = createSlice({
  name: "media",
  initialState,
  reducers: {
    fetchListRequest: () => {},
    fetchListSuccess: (state, action: PayloadAction<MediaList>) => {
      state.items = action.payload.items;
      state.folder = action.payload.folder;
      state.maxBytes = action.payload.max_bytes;
    },
    fetchListFailure: (_state, _action: PayloadAction<string>) => {},

    /** Lưu file vào thư mục của máy chủ (file vẫn phát ngay từ trình duyệt, không chờ tải lên xong) */
    uploadRequest: (state, action: PayloadAction<File>) => {
      state.uploading = action.payload.name;
    },
    uploadSuccess: (state, action: PayloadAction<MediaItem>) => {
      state.uploading = null;
      state.items = [action.payload, ...state.items.filter((item) => item.name !== action.payload.name)];
    },
    uploadFailure: (state, _action: PayloadAction<string>) => {
      state.uploading = null;
    },
  },
});

export const mediaActions = mediaSlice.actions;
export const mediaReducer = mediaSlice.reducer;
