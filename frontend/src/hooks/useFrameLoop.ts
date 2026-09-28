import { useEffect, useRef, type RefObject } from "react";

import { MAX_FRAMES_IN_FLIGHT, MIN_FRAME_INTERVAL_MS, LASER_UPLOAD_MAX_SIDE, LASER_JPEG_QUALITY } from "@/common/constants";
import type { FrameOptions } from "@/common/types";
import { useAppStore } from "@/store/hooks";
import { visionActions } from "@/store/vision";
import { canvasToJpeg, captureFrame } from "@/utils/capture";
import { laserHint } from "@/utils/laserTrack";

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  mirror: boolean;
  options: FrameOptions | null;
}

const retryDelay = (status: number) => (status === 429 ? 600 + Math.random() * 500 : status >= 400 ? 2000 : 1500);

/** Capture only new camera frames. Timers and completion bookkeeping do not re-render React. */
export const useFrameLoop = ({ videoRef, active, mirror, options }: Params) => {
  const store = useAppStore();
  const latestOptions = useRef(options);
  const pointerMode = options?.pointer_mode;
  const laserColor = options?.laser_color;
  const laserBrightness = options?.laser_brightness;
  useEffect(() => {
    latestOptions.current = options;
  }, [options]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    const upload = document.createElement("canvas");
    let cancelled = false;
    let encoding = false;
    let timer: number | undefined;
    let videoCallback: number | undefined;
    let fallbackCallback: number | undefined;
    let completed = store.getState().vision.frameSeq;
    let pacedResultId = store.getState().vision.lastFrameId;
    let processingInterval = store.getState().vision.result?.processing_ms ?? 0;
    let sent = completed;
    let nextAllowedAt = 0;
    let retryAt = 0;
    let lastMediaTime = -1;
    let lastPresentedTime = -1;
    let frameInterval = MIN_FRAME_INTERVAL_MS;
    let lastCaptureStarted = -Infinity;

    const schedule = () => {
      if (cancelled || encoding || timer !== undefined || videoCallback !== undefined || fallbackCallback !== undefined) return;
      const { vision } = store.getState();
      const limit = vision.frameError ? 1 : MAX_FRAMES_IN_FLIGHT;
      if (sent - vision.frameSeq >= limit) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (typeof video.requestVideoFrameCallback === "function") {
          videoCallback = video.requestVideoFrameCallback((_now, metadata) => {
            videoCallback = undefined;
            void capture(metadata.mediaTime);
          });
        } else {
          fallbackCallback = requestAnimationFrame(() => {
            fallbackCallback = undefined;
            void capture(video.currentTime);
          });
        }
      }, Math.max(0, retryAt - performance.now()));
    };

    const capture = async (mediaTime: number) => {
      if (cancelled) return;
      if (lastPresentedTime >= 0 && mediaTime > lastPresentedTime) {
        frameInterval = Math.min(200, Math.max(8, (mediaTime - lastPresentedTime) * 1000));
      }
      lastPresentedTime = mediaTime;
      // Register before the next camera frame; waiting one full interval THEN registering
      // would miss every other frame on a 30 FPS camera.
      const frameSlack = Math.min(50, frameInterval / 2) + 2;
      if (performance.now() + frameSlack < nextAllowedAt ||
          performance.now() - lastCaptureStarted < MIN_FRAME_INTERVAL_MS - 2) {
        schedule();
        return;
      }
      const opts = latestOptions.current;
      if (!opts || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || mediaTime === lastMediaTime) {
        nextAllowedAt = performance.now() + MIN_FRAME_INTERVAL_MS;
        schedule();
        return;
      }
      const capturedAt = Date.now();
      const captureStarted = performance.now();
      lastCaptureStarted = captureStarted;
      encoding = true;
      let image: Blob | null = null;
      try {
        const laser = opts.pointer_mode === "laser";
        if (captureFrame(video, upload, mirror, laser ? LASER_UPLOAD_MAX_SIDE : undefined)) {
          lastMediaTime = mediaTime;
          image = await canvasToJpeg(upload, laser ? LASER_JPEG_QUALITY : undefined);
        }
      } catch {
        // The camera can disappear during drawImage/toBlob; retry without breaking the loop.
      } finally {
        encoding = false;
      }
      // An old encoder can finish AFTER pause/resume or a camera/mirror switch.
      if (cancelled) return;
      if (performance.now() < retryAt) {
        schedule();
        return;
      }
      if (!image) {
        nextAllowedAt = performance.now() + 200;
        schedule();
        return;
      }
      const { vision } = store.getState();
      // Pace slow GPUs/CPU while still allowing upload and inference to overlap.
      // Carry the pacing deadline forward: rounding to camera frames must not halve FPS
      // when inference takes just slightly longer than one camera interval.
      nextAllowedAt = Math.max(captureStarted - frameSlack, nextAllowedAt) +
        Math.max(MIN_FRAME_INTERVAL_MS, processingInterval);
      sent += 1;
      // Gợi ý chỉ có nghĩa khi khung mới cùng cỡ với khung đã cho ra vị trí đang bám
      const sameSize = vision.result?.resolution.width === upload.width && vision.result?.resolution.height === upload.height;
      store.dispatch(visionActions.analyzeFrameRequest({
        id: vision.lastRequestId + 1,
        image,
        options: opts,
        capturedAt,
        laserHint: opts.pointer_mode === "laser" && sameSize ? laserHint(vision.laserTrack) : null,
      }));
      schedule();
    };

    const unsubscribe = store.subscribe(() => {
      const { vision } = store.getState();
      if (vision.frameSeq === completed) return;
      completed = vision.frameSeq;
      if (vision.result && vision.lastFrameId !== pacedResultId) {
        pacedResultId = vision.lastFrameId;
        // A single slow GPU frame should not make the next few camera frames disappear.
        const measured = vision.result.processing_ms;
        const average = processingInterval > 0
          ? processingInterval * 0.8 + vision.result.processing_ms * 0.2
          : vision.result.processing_ms;
        // The first CUDA frame can take seconds after the OS pages memory back in.
        // Recover promptly when it becomes fast again; in-flight limits still handle slow models.
        processingInterval = Math.min(250, measured * 1.25, average);
        nextAllowedAt = Math.min(nextAllowedAt, lastCaptureStarted + Math.max(MIN_FRAME_INTERVAL_MS, processingInterval));
      }
      if (vision.frameError) {
        retryAt = performance.now() + retryDelay(vision.frameError.status);
        nextAllowedAt = retryAt;
        if (timer !== undefined) window.clearTimeout(timer);
        if (videoCallback !== undefined) video.cancelVideoFrameCallback(videoCallback);
        if (fallbackCallback !== undefined) cancelAnimationFrame(fallbackCallback);
        timer = videoCallback = fallbackCallback = undefined;
      }
      schedule();
    });
    schedule();
    return () => {
      cancelled = true;
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
      if (videoCallback !== undefined) video.cancelVideoFrameCallback(videoCallback);
      if (fallbackCallback !== undefined) cancelAnimationFrame(fallbackCallback);
      store.dispatch(visionActions.cancelFrames());
    };
  }, [active, mirror, pointerMode, laserColor, laserBrightness, store, videoRef]);
};
