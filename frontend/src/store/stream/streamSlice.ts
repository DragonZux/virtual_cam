import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { StreamLink } from "@/common/types";
import { loadStreamLinks, MAX_STREAMS } from "@/utils/stream";

/** Camera RTSP của trình duyệt này; streamEpics lưu vào localStorage sau mỗi thay đổi */
interface StreamState {
  links: StreamLink[];
  /** Cài đặt bấm "Kết nối": khung camera (trang Tổng quan, luôn mount) mở luồng này rồi xoá yêu cầu */
  connectRequest: string | null;
}

const initialState: StreamState = { links: loadStreamLinks(), connectRequest: null };

const streamSlice = createSlice({
  name: "stream",
  initialState,
  reducers: {
    /** Thêm mới, hoặc sửa camera có địa chỉ `previous` (giữ vị trí trong danh sách) */
    saveLink: (state, action: PayloadAction<{ link: StreamLink; previous?: string }>) => {
      const { link, previous } = action.payload;
      const index = state.links.findIndex((item) => item.url === (previous ?? link.url));
      const others = state.links.filter((item, i) => i !== index && item.url !== link.url);
      if (index >= 0) others.splice(Math.min(index, others.length), 0, link);
      else others.push(link);
      state.links = others.slice(0, MAX_STREAMS);
    },
    removeLink: (state, action: PayloadAction<string>) => {
      state.links = state.links.filter((item) => item.url !== action.payload);
    },
    requestConnect: (state, action: PayloadAction<string>) => {
      state.connectRequest = action.payload;
    },
    connectHandled: (state) => {
      state.connectRequest = null;
    },
  },
});

export const streamActions = streamSlice.actions;
export const streamReducer = streamSlice.reducer;
