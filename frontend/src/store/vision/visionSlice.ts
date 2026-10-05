import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CameraStatus, FrameOptions, FrameResult, VisionStatus } from "@/common/types";
import { EMPTY_LASER_TRACK, type LaserPoint, type LaserTrack } from "@/utils/laserTrack";
import { EMPTY_TRACKING, type Tracking } from "@/utils/tracking";

export type Connection = "connecting" | "online" | "offline";

export interface CameraState {
  status: CameraStatus;
  /** Mã lỗi → camera.errors.<code> */
  error: string | null;
  /** Camera RTSP đang mở / vừa dùng (giữ khi lỗi hoặc tắt để kết nối lại) */
  stream: string | null;
}

export interface FrameError {
  /** 0 = mất mạng / hết thời gian chờ */
  status: number;
  message: string;
}

interface VisionState {
  /** GET /vision/status gần nhất */
  status: VisionStatus | null;
  connection: Connection;
  camera: CameraState;
  paused: boolean;
  /** Kết quả khung gần nhất (toạ độ theo khung đã gửi) */
  result: FrameResult | null;
  /** Số phản hồi khung đã nhận (thành công / lỗi / bỏ qua vì cũ) — useFrameLoop so với số khung đã gửi */
  frameSeq: number;
  /** id của khung mới nhất đã hiển thị — kết quả của khung cũ hơn về sau thì bỏ (gửi gối đầu có thể về lệch thứ tự) */
  lastFrameId: number;
  /** Request IDs persist across camera restarts and component remounts. */
  lastRequestId: number;
  lastCaptureAt: number | null;
  frameError: FrameError | null;
  lastResultAt: number | null;
  tracking: Tracking;
  /** Chấm laser đang bám qua các khung (chế độ laser) */
  laserTrack: LaserTrack;
  /** Lần đầu bật camera trong phiên (đếm thời gian phiên) */
  sessionStartedAt: number | null;
}

const initialState: VisionState = {
  status: null,
  connection: "connecting",
  camera: { status: "off", error: null, stream: null },
  paused: false,
  result: null,
  frameSeq: 0,
  lastFrameId: 0,
  lastRequestId: 0,
  lastCaptureAt: null,
  frameError: null,
  lastResultAt: null,
  tracking: EMPTY_TRACKING,
  laserTrack: EMPTY_LASER_TRACK,
  sessionStartedAt: null,
};

const resetLive = (state: VisionState) => {
  state.result = null;
  state.frameError = null;
  state.lastResultAt = null;
  state.lastCaptureAt = null;
  state.tracking = EMPTY_TRACKING;
  state.laserTrack = EMPTY_LASER_TRACK;
};

const visionSlice = createSlice({
  name: "vision",
  initialState,
  reducers: {
    /** Hỏi GET /vision/status định kỳ (MainLayout) */
    startStatusPolling: () => {},
    stopStatusPolling: () => {},
    startSelectionStream: () => {},
    stopSelectionStream: () => {},
    getStatusSuccess: (state, action: PayloadAction<VisionStatus>) => {
      if (state.status && state.status.model_revision !== action.payload.model_revision) {
        state.lastFrameId = state.lastRequestId;
        resetLive(state);
      }
      state.status = action.payload;
      state.connection = "online";
    },
    getStatusFailure: (state, _action: PayloadAction<string>) => {
      state.connection = "offline";
    },

    /** Bắt đầu mở camera RTSP qua máy chủ (giữ địa chỉ khi lỗi để thử lại) */
    streamStarting: (state, action: PayloadAction<string>) => {
      state.camera = { status: "starting", stream: action.payload, error: null };
    },
    cameraStarted: (state, action: PayloadAction<{ stream: string; startedAt: number }>) => {
      const { startedAt, stream } = action.payload;
      state.camera = { status: "on", error: null, stream };
      state.paused = false;
      state.sessionStartedAt ??= startedAt;
      resetLive(state);
    },
    cameraStopped: (state) => {
      state.camera.status = "off";
      state.paused = false;
      resetLive(state);
    },
    cameraFailed: (state, action: PayloadAction<string>) => {
      state.camera.status = "error";
      state.camera.error = action.payload;
      state.paused = false;
      resetLive(state);
    },
    setPaused: (state, action: PayloadAction<boolean>) => {
      state.paused = action.payload;
      state.frameError = null;
          state.lastResultAt = null;
    },

    /** Khung đã chụp (id tăng dần) → epic gửi lên máy chủ; tạm dừng / tắt camera huỷ các request đang chờ */
    analyzeFrameRequest: (
      state,
      action: PayloadAction<{ id: number; image: Blob; options: FrameOptions; capturedAt: number; laserHint?: LaserPoint | null }>,
    ) => {
      state.lastRequestId = action.payload.id;
    },
    analyzeFrameSuccess: (
      state,
      action: PayloadAction<{
        id: number;
        result: FrameResult;
        tracking: Tracking;
        laserTrack?: LaserTrack;
        at: number;
        capturedAt: number;
      }>,
    ) => {
      const { id, result, tracking, laserTrack, at, capturedAt } = action.payload;
      state.lastFrameId = id;
      state.lastCaptureAt = capturedAt;
      state.lastResultAt = at;
      state.result = result;
      state.tracking = tracking;
      state.laserTrack = laserTrack ?? EMPTY_LASER_TRACK;
      state.frameError = null;
      state.frameSeq += 1;
    },
    analyzeFrameFailure: (state, action: PayloadAction<FrameError>) => {
      state.frameError = action.payload;
          state.lastResultAt = null;
      state.frameSeq += 1;
    },
    /** Kết quả của khung cũ hơn khung đang hiển thị — chỉ đếm để vòng gửi tiếp tục */
    analyzeFrameSkipped: (state) => {
      state.frameSeq += 1;
    },
    /** Tab bị ẩn: huỷ khung đang gửi */
    cancelFrames: (state) => {
      state.lastFrameId = state.lastRequestId;
      resetLive(state);
    },
  },
});

export const visionActions = visionSlice.actions;
export const visionReducer = visionSlice.reducer;
