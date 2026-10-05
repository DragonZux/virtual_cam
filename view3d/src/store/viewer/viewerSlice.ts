import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { AUTO_FOLLOW } from "@/utils/sessions";
import { readPageParams } from "@/utils/preferences";
import { streamActions } from "../stream/streamSlice";

interface Preview {
  name: string;
  /** Mở từ ?preview= trên địa chỉ trang: giữ tới khi người xem bấm quay lại trực tiếp */
  sticky: boolean;
}

/** Trạng thái màn hình (không lưu): phiên đang theo dõi, mô hình đang xem thử, địa chỉ ?ws= */
interface ViewerState {
  /** AUTO_FOLLOW = phiên có lựa chọn mới nhất, hoặc session_id được ghim */
  follow: string;
  preview: Preview | null;
  /** ?ws= trên địa chỉ trang — ưu tiên hơn Cài đặt, không lưu lại */
  wsOverride: string | null;
}

const params = readPageParams();

const initialState: ViewerState = {
  follow: AUTO_FOLLOW,
  preview: params.preview ? { name: params.preview, sticky: true } : null,
  wsOverride: params.ws,
};

const viewerSlice = createSlice({
  name: "viewer",
  initialState,
  reducers: {
    setFollow: (state, action: PayloadAction<string>) => {
      state.follow = action.payload;
    },
    /** Xem thử một vật thể; lần chọn mới trên camera sẽ đưa màn hình về trực tiếp */
    setPreview: (state, action: PayloadAction<string | null>) => {
      state.preview = action.payload ? { name: action.payload, sticky: false } : null;
    },
  },
  extraReducers: (builder) => {
    // Phiên được ghim đã ngắt (camera nối lại sẽ có session_id mới) → quay về tự động
    builder.addCase(streamActions.messageReceived, (state, action) => {
      if (state.follow === AUTO_FOLLOW) return;
      const message = action.payload;
      const gone =
        message.type === "selection.snapshot"
          ? !message.sessions.some((s) => s.session_id === state.follow && s.connected)
          : message.session_id === state.follow && !message.connected;
      if (gone) state.follow = AUTO_FOLLOW;
    });
  },
});

export const viewerActions = viewerSlice.actions;
export const viewerReducer = viewerSlice.reducer;
