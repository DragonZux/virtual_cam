import { createSelector } from "@reduxjs/toolkit";

import type { LiveState, MirrorMode } from "@/common/types";
import type { RootState } from "@/store/types";
import type { CameraState } from "./visionSlice";

export const getVisionState = (state: RootState) => state.vision;
export const getVisionStatus = (state: RootState) => state.vision.status;
export const getConnection = (state: RootState) => state.vision.connection;
export const getCamera = (state: RootState) => state.vision.camera;
export const isPaused = (state: RootState) => state.vision.paused;
export const getFrameResult = (state: RootState) => state.vision.result;
export const getFrameSeq = (state: RootState) => state.vision.frameSeq;
export const getFrameError = (state: RootState) => state.vision.frameError;
export const getFps = (state: RootState) => state.vision.fps;
export const getTracking = (state: RootState) => state.vision.tracking;
export const getSessionStartedAt = (state: RootState) => state.vision.sessionStartedAt;

export const isDetectorReady = (state: RootState) =>
  state.vision.connection === "online" && state.vision.status?.phase === "ready";

export const getShareUrls = createSelector([getVisionStatus], (status) => status?.share_urls ?? []);

/**
 * Lật ngang khi là camera trước; webcam laptop thường không báo facingMode nên cũng coi là camera trước.
 * Ảnh / video thử luôn giữ nguyên chiều.
 */
export const selectMirror = (mode: MirrorMode, camera: Pick<CameraState, "facingMode" | "source">): boolean =>
  camera.source === "media" ? false : mode === "auto" ? camera.facingMode !== "environment" : mode === "on";

export const getLiveState = createSelector(
  [getConnection, getVisionStatus, getCamera, isPaused, getFrameError, getFrameResult],
  (connection, status, camera, paused, frameError, result): LiveState => {
    if (connection === "offline") return "offline";
    if (status?.phase === "error") return "error";
    if (camera.status === "on") {
      if (paused) return "paused";
      if (frameError && frameError.status !== 429) return "reconnecting";
      if (result) return "live";
      return status?.phase === "ready" ? "waiting" : "starting";
    }
    if (connection === "connecting") return "connecting";
    return status?.phase === "ready" ? "ready" : "starting";
  },
);
