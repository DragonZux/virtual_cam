import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CameraInfo, CameraStatus, FrameResult, VisionStatus } from "@/common/types";
import { EMPTY_TRACKING, type Tracking } from "@/utils/tracking";

export type Connection = "connecting" | "online" | "offline";

export interface CameraState {
  status: CameraStatus;
  /** Mã lỗi → camera.errors.<code> */
  error: string | null;
  /** Thông báo của máy chủ (không lấy được hình…) — hiện thay cho câu theo `error` */
  message: string | null;
  /** Địa chỉ đầy đủ (danh sách của trình duyệt này) của camera đang chạy / vừa dùng — để kết nối lại */
  stream: string | null;
  /** Camera máy chủ đang chạy (địa chỉ không mật khẩu, tên); null = máy chủ không chạy camera nào */
  server: { url: string; name: string | null } | null;
}

export interface FrameError {
  /** 0 = máy chủ báo qua WebSocket camera (mất tín hiệu RTSP, lỗi nhận diện) */
  status: number;
  message: string;
}

interface VisionState {
  /** GET /vision/status gần nhất */
  status: VisionStatus | null;
  connection: Connection;
  camera: CameraState;
  paused: boolean;
  /** Kết quả gần nhất máy chủ đẩy về (toạ độ theo khung máy chủ nhận diện) */
  result: FrameResult | null;
  /** Ước lượng lúc máy chủ đọc được khung của `result` (giờ trình duyệt) */
  lastCaptureAt: number | null;
  frameError: FrameError | null;
  lastResultAt: number | null;
  /** Giữ để xác nhận — máy chủ tính, trang chỉ hiển thị */
  tracking: Tracking;
  /** Lần đầu bật camera trong phiên (đếm thời gian phiên) */
  sessionStartedAt: number | null;
}

const initialState: VisionState = {
  status: null,
  connection: "connecting",
  camera: { status: "off", error: null, message: null, stream: null, server: null },
  paused: false,
  result: null,
  lastCaptureAt: null,
  frameError: null,
  lastResultAt: null,
  tracking: EMPTY_TRACKING,
  sessionStartedAt: null,
};

const resetLive = (state: VisionState) => {
  state.result = null;
  state.frameError = null;
  state.lastResultAt = null;
  state.lastCaptureAt = null;
  state.tracking = EMPTY_TRACKING;
};

const visionSlice = createSlice({
  name: "vision",
  initialState,
  reducers: {
    /** Hỏi GET /vision/status định kỳ (MainLayout) */
    startStatusPolling: () => {},
    stopStatusPolling: () => {},
    getStatusSuccess: (state, action: PayloadAction<VisionStatus>) => {
      if (state.status && state.status.model_revision !== action.payload.model_revision) resetLive(state);
      state.status = action.payload;
      state.connection = "online";
    },
    getStatusFailure: (state, _action: PayloadAction<string>) => {
      state.connection = "offline";
    },

    /** Đã yêu cầu máy chủ chạy camera này (giữ địa chỉ khi lỗi để thử lại) */
    streamStarting: (state, action: PayloadAction<string>) => {
      state.camera = { ...state.camera, status: "starting", stream: action.payload, error: null, message: null };
    },
    /** Đã yêu cầu máy chủ tắt camera (máy chủ xác nhận qua bản tin "camera") */
    cameraStopped: (state) => {
      state.camera.status = "off";
      state.camera.server = null;
      resetLive(state);
    },
    /** Máy chủ không chạy được camera; payload = thông báo của máy chủ */
    cameraFailed: (state, action: PayloadAction<string | null>) => {
      state.camera = { ...state.camera, status: "error", error: "stream", message: action.payload };
      resetLive(state);
    },
    /** Bản tin "camera" của /api/camera/ws; `stream` = địa chỉ đầy đủ trong danh sách trình duyệt này nếu có */
    cameraInfo: (state, action: PayloadAction<{ info: CameraInfo; stream: string | null; at: number }>) => {
      const { info, stream, at } = action.payload;
      const camera = state.camera;
      const server = info.status === "off" || !info.url ? null : { url: info.url, name: info.name };
      const switched = server?.url !== camera.server?.url;
      camera.server = server;
      if (stream) camera.stream = stream;
      if (state.paused !== !info.detect) {
        state.paused = !info.detect;
        resetLive(state);
      }
      if (info.status === "off") {
        // Giữ lỗi của lần kết nối vừa hỏng / trạng thái đang mở do chính trang này yêu cầu
        if (camera.status === "on") {
          camera.status = "off";
          resetLive(state);
        }
        return;
      }
      if (info.status === "connecting") {
        Object.assign(camera, info.error
          ? { status: "error", error: "stream", message: info.error }
          : { status: "starting", error: null, message: null });
        return;
      }
      if (camera.status !== "on" || switched) {
        camera.status = "on";
        state.sessionStartedAt ??= at;
        resetLive(state);
      }
      camera.error = camera.message = null;
      // Mất tín hiệu RTSP / lỗi nhận diện: hiện trên khung camera, máy chủ tự thử lại
      state.frameError = info.error ? { status: 0, message: info.error } : null;
      if (info.error) state.lastResultAt = null;
    },
    /** Tạm dừng nhận diện (chung cho máy chủ; hình vẫn chạy) — máy chủ xác nhận qua bản tin "camera" */
    setPaused: (state, action: PayloadAction<boolean>) => {
      state.paused = action.payload;
      resetLive(state);
    },

    /** Kết quả máy chủ đẩy về qua /api/camera/ws */
    liveResult: (state, action: PayloadAction<{ result: FrameResult; tracking: Tracking; at: number; capturedAt: number }>) => {
      const { result, tracking, at, capturedAt } = action.payload;
      state.result = result;
      state.tracking = tracking;
      state.lastResultAt = at;
      state.lastCaptureAt = capturedAt;
      state.frameError = null;
    },
    /** Tab bị ẩn / đang nạp mô hình: bỏ kết quả đang hiển thị */
    clearResult: (state) => {
      resetLive(state);
    },
  },
});

export const visionActions = visionSlice.actions;
export const visionReducer = visionSlice.reducer;
