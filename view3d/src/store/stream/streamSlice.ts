import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { RECENT_COUNT } from "@/common/constants";
import type { ConnectionStatus, RecentObject, SelectionMessage, SelectionSession, ShownSelection } from "@/common/types";
import { latestSelected, toShown } from "@/utils/sessions";

/** Kết nối WebSocket và các phiên camera máy chủ đang phát */
interface StreamState {
  status: ConnectionStatus;
  /** Địa chỉ WebSocket đang dùng; null khi địa chỉ đã đặt không hợp lệ */
  url: string | null;
  /** Lần thử lại tiếp theo sau bấy nhiêu ms (status = closed) */
  retryInMs: number;
  /** Đã kết nối được tới url hiện tại ít nhất một lần */
  everOpened: boolean;
  /** Phiên camera đang phát, theo session_id */
  sessions: Record<string, SelectionSession>;
  /** Lựa chọn (không null) mới nhất đã nhận — vẫn giữ khi phiên bỏ chọn / ngắt */
  last: ShownSelection | null;
  /** Vật thể vừa chọn, mới nhất trước */
  recent: RecentObject[];
  /** Tăng mỗi lần có vật thể được chọn: cảnh 3D phát hiệu ứng, bỏ chế độ xem thử */
  revision: number;
}

const initialState: StreamState = {
  status: "connecting",
  url: null,
  retryInMs: 0,
  everOpened: false,
  sessions: {},
  last: null,
  recent: [],
  revision: 0,
};

/** Một lần chọn mới (vật thể khác, hoặc chọn lại sau khi bỏ chọn); hai lần liền nhau cùng vật thể gộp một dòng */
const select = (state: StreamState, shown: ShownSelection) => {
  state.revision += 1;
  state.last = shown;
  const entry: RecentObject = {
    id: state.revision,
    name: shown.name,
    confidence: shown.confidence,
    session_id: shown.session_id,
    timestamp: shown.timestamp,
  };
  if (state.recent[0]?.name === shown.name) state.recent[0] = { ...entry, id: state.recent[0].id };
  else state.recent = [entry, ...state.recent].slice(0, RECENT_COUNT);
};

const streamSlice = createSlice({
  name: "stream",
  initialState,
  reducers: {
    start: () => {},
    stop: () => {},
    connecting: (state, action: PayloadAction<string>) => {
      // Đổi sang máy chủ khác: bỏ ngay các phiên của máy chủ cũ
      if (state.url !== action.payload) {
        state.url = action.payload;
        state.everOpened = false;
        state.sessions = {};
      }
      state.status = "connecting";
    },
    opened: (state) => {
      state.status = "open";
      state.everOpened = true;
      state.retryInMs = 0;
    },
    /** Socket đóng: xoá các phiên (nối lại sẽ nhận snapshot mới), giữ "vừa chọn" và danh sách gần đây */
    closed: (state, action: PayloadAction<number>) => {
      state.status = "closed";
      state.retryInMs = action.payload;
      state.sessions = {};
    },
    invalidUrl: (state) => {
      state.status = "closed";
      state.url = null;
      state.retryInMs = 0;
      state.everOpened = false;
      state.sessions = {};
    },
    messageReceived: (state, action: PayloadAction<SelectionMessage>) => {
      const message = action.payload;
      if (message.type === "selection.snapshot") {
        // Snapshot thay toàn bộ trạng thái đang giữ (README › WebSocket)
        const before = state.sessions;
        state.sessions = Object.fromEntries(
          message.sessions.filter((s) => s.connected).map((s) => [s.session_id, s]),
        );
        const latest = latestSelected(Object.values(state.sessions));
        const shown = latest && toShown(latest);
        if (!shown) return;
        const sameAsLast = state.last?.session_id === shown.session_id && state.last.name === shown.name;
        if (before[shown.session_id]?.selected?.name !== shown.name && !sameAsLast) select(state, shown);
        else if (sameAsLast) state.last = shown;
        return;
      }
      const { type: _type, ...session } = message;
      const previous = state.sessions[session.session_id];
      if (!session.connected) {
        delete state.sessions[session.session_id];
        return;
      }
      state.sessions[session.session_id] = session;
      const shown = toShown(session);
      if (!shown) return;
      if (previous?.selected?.name !== shown.name) select(state, shown);
      // Cùng vật thể, chỉ đổi độ tin cậy / chế độ chỉ
      else if (state.last?.session_id === shown.session_id) state.last = shown;
    },
    clearRecent: (state) => {
      state.recent = [];
    },
  },
});

export const streamActions = streamSlice.actions;
export const streamReducer = streamSlice.reducer;
