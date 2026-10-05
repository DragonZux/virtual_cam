import { createSelector } from "@reduxjs/toolkit";

import { ENV_WS_URL } from "@/environment";
import type { RootState } from "@/store/types";
import { pickDisplayed } from "@/utils/sessions";
import { resolveWsUrl } from "@/utils/wsUrl";

export const getConnection = (state: RootState) => state.stream.status;
export const getStream = (state: RootState) => state.stream;
export const getRecent = (state: RootState) => state.stream.recent;
export const getRevision = (state: RootState) => state.stream.revision;
const getSessionMap = (state: RootState) => state.stream.sessions;

/** Địa chỉ đang có hiệu lực: ?ws= > VITE_WS_URL > cùng máy chủ đã mở trang (proxy /api → backend) */
export const getWsInput = (state: RootState): string => state.viewer.wsOverride ?? ENV_WS_URL;

/** Địa chỉ WebSocket đầy đủ; null nếu địa chỉ đã đặt không hợp lệ */
export const getWsUrl = (state: RootState): string | null => resolveWsUrl(getWsInput(state), window.location);

/** Phiên camera, mới cập nhật trước */
export const getSessions = createSelector([getSessionMap], (sessions) =>
  Object.values(sessions).sort((a, b) => b.timestamp - a.timestamp),
);

export const getDisplayed = createSelector(
  [
    getSessionMap,
    (state: RootState) => state.viewer.follow,
    (state: RootState) => state.stream.last,
    (state: RootState) => state.viewer.preview?.name ?? null,
    (state: RootState) => state.setting.prefs.keepLast,
  ],
  (sessions, follow, last, preview, keepLast) => pickDisplayed({ sessions, follow, last, preview, keepLast }),
);
