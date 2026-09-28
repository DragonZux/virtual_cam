import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { MAX_HISTORY } from "@/common/constants";
import type { SelectionEvent } from "@/common/types";

/** Lịch sử lựa chọn của phiên — chỉ nằm trong tab này, tải lại trang là mất */
interface HistoryState {
  /** Mới nhất trước, tối đa MAX_HISTORY */
  events: SelectionEvent[];
  /** Thống kê cả phiên (không bị cắt theo MAX_HISTORY) */
  total: number;
  byName: Record<string, number>;
  confidenceSum: number;
}

const initialState: HistoryState = { events: [], total: 0, byName: {}, confidenceSum: 0 };

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    addSelection: (state, action: PayloadAction<Omit<SelectionEvent, "id">>) => {
      const { name, confidence } = action.payload;
      state.total += 1;
      state.events.unshift({ id: state.total, ...action.payload });
      if (state.events.length > MAX_HISTORY) state.events.length = MAX_HISTORY;
      state.byName[name] = (state.byName[name] ?? 0) + 1;
      state.confidenceSum += confidence;
    },
    clearHistory: () => initialState,
  },
});

export const historyActions = historySlice.actions;
export const historyReducer = historySlice.reducer;
