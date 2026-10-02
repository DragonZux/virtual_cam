import { createSelector } from "@reduxjs/toolkit";

import type { LiveState } from "@/common/types";
import type { RootState } from "@/store/types";

export const getVisionStatus = (state: RootState) => state.vision.status;
export const getConnection = (state: RootState) => state.vision.connection;
export const getCamera = (state: RootState) => state.vision.camera;
export const isPaused = (state: RootState) => state.vision.paused;
export const getFrameResult = (state: RootState) => state.vision.result;
export const getFrameError = (state: RootState) => state.vision.frameError;
export const getTracking = (state: RootState) => state.vision.tracking;
export const getSessionStartedAt = (state: RootState) => state.vision.sessionStartedAt;

export const isDetectorReady = (state: RootState) =>
  state.vision.connection === "online" && state.vision.status?.phase === "ready";


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
