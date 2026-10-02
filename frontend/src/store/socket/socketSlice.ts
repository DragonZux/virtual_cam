import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { SocketConfig, TcpTarget } from "@/common/types";

interface SocketState {
  config: SocketConfig | null;
  saving: boolean;
  error: string | null;
}

const initialState: SocketState = { config: null, saving: false, error: null };

const socketSlice = createSlice({
  name: "socket",
  initialState,
  reducers: {
    /** Cài đặt hỏi lại định kỳ để thấy trạng thái kết nối của từng máy đích */
    loadRequest: () => {},
    loadSuccess: (state, action: PayloadAction<SocketConfig>) => {
      state.config = action.payload;
    },
    loadFailure: (state, action: PayloadAction<string>) => {
      if (!state.config) state.error = action.payload;
    },
    saveRequest: (state, _action: PayloadAction<TcpTarget[]>) => {
      state.saving = true;
      state.error = null;
    },
    saveSuccess: (state, action: PayloadAction<SocketConfig>) => {
      state.config = action.payload;
      state.saving = false;
    },
    saveFailure: (state, action: PayloadAction<string>) => {
      state.saving = false;
      state.error = action.payload;
    },
    dismiss: (state) => {
      state.error = null;
    },
  },
});

export const socketActions = socketSlice.actions;
export const socketReducer = socketSlice.reducer;
