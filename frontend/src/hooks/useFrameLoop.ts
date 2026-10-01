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
  const modelRevision = options?.model_revision;
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
    let lastPresentedFrame: number | undefined;
    let frameInterval = MIN_FRAME_INTERVAL_MS;
    let lastCaptureStarted = -Infinity;

    const frameSlack = () => Math.min(50, frameInterval / 2) + 2;

    const schedule = () => {
      if (cancelled || encoding || timer !== undefined || videoCallback !== undefined || fallbackCallback !== undefined) return;
      const { vision } = store.getState();
      // With slow inference, a second request mostly waits behind the first
      // and can exceed the server's busy timeout. Capture afresh on completion.
      const limit = vision.frameError || processingInterval > 250 ? 1 : MAX_FRAMES_IN_FLIGHT;
      if (sent - vision.frameSeq >= limit) return;
      const requestNextFrame = () => {
        if (typeof video.requestVideoFrameCallback === "function") {
          videoCallback = video.requestVideoFrameCallback((_now, metadata) => {
            videoCallback = undefined;
            void capture(metadata.mediaTime, metadata.presentedFrames);
          });
        } else {
          fallbackCallback = requestAnimationFrame(() => {
            fallbackCallback = undefined;
            void capture(video.currentTime, video.getVideoPlaybackQuality?.().totalVideoFrames);
          });
        }
      };
      // Sleep through frames that cannot be sent. Register a camera callback
      // one interval early so rounding to camera frames does not halve FPS.
      const delay = Math.max(retryAt, nextAllowedAt - frameInterval - frameSlack()) - performance.now();
      if (delay > 0) {
        timer = window.setTimeout(() => {
          timer = undefined;
          requestNextFrame();
        }, delay);
      } else requestNextFrame();
    };

    const capture = async (mediaTime: number, presentedFrames?: number) => {
      if (cancelled) return;
      if (lastPresentedTime >= 0 && mediaTime > lastPresentedTime) {
        // Timer pacing skips callbacks, not camera frames. Use frame counters
        // so the sleep interval is not mistaken for a slower camera rate.
        const frames = presentedFrames !== undefined && lastPresentedFrame !== undefined
          ? presentedFrames - lastPresentedFrame : 0;
        if (frames > 0) frameInterval = Math.min(200, Math.max(8, (mediaTime - lastPresentedTime) * 1000 / frames));
      }
      lastPresentedTime = mediaTime;
      lastPresentedFrame = presentedFrames;
      // Register before the next camera frame; waiting one full interval THEN registering
      // would miss every other frame on a 30 FPS camera.
      const slack = frameSlack();
      if (performance.now() + slack < nextAllowedAt ||
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
      nextAllowedAt = Math.max(captureStarted - slack, nextAllowedAt) +
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
        // Respect sustained CPU inference times above 250 ms too: capping here
        // fills the server queue with old frames. The current sample still
        // lets pacing recover immediately after a slow startup frame.
        processingInterval = Math.min(measured * 1.25, average);
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
  }, [active, mirror, pointerMode, modelRevision, store, videoRef]);
};
