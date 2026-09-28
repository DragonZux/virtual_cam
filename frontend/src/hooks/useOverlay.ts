import { useEffect, useRef, type RefObject } from "react";

import { DISPLAY_MAX_SIDE } from "@/common/constants";
import type { FrameResult, Preferences } from "@/common/types";
import { drawResult } from "@/utils/overlay";
import { smoothHand } from "@/utils/smoothing";
import { dwellProgress, type Tracking } from "@/utils/tracking";

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  objectsRef: RefObject<HTMLCanvasElement | null>;
  active: boolean;
  result: FrameResult | null;
  receivedAt: number | null;
  capturedAt: number | null;
  tracking: Tracking;
  prefs: Preferences;
  label: (name: string) => string;
}

/** Keep animation off the React render cycle; stop painting when the panel/tab is hidden. */
export const useOverlay = ({ videoRef, canvasRef, objectsRef, active, ...state }: Params) => {
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const objects = objectsRef.current;
    if (!canvas || !objects || !video) return;
    const clear = () => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      objects.getContext("2d")?.clearRect(0, 0, objects.width, objects.height);
    };
    if (!active) {
      clear();
      return;
    }
    let animation = 0;
    let lastPaint = 0;
    let displayed: FrameResult | null = null;
    let cachedResult: FrameResult | null = null;
    let cachedPrefs: Preferences | null = null;
    let cachedLabel: Params["label"] | null = null;
    let handWasVisible = false;
    const paint = (now: number) => {
      const { result, receivedAt, capturedAt, tracking, prefs, label } = latest.current;
      const age = receivedAt === null ? Infinity : Date.now() - receivedAt;
      const latency = receivedAt !== null && capturedAt !== null ? receivedAt - capturedAt : 0;
      const staleAfter = Math.min(1500, Math.max(500, latency * 2));
      if (!result || age > staleAfter || !video.videoWidth || !video.videoHeight) {
        if (displayed) clear();
        displayed = null;
      } else {
        displayed = smoothHand(displayed, result, lastPaint ? now - lastPaint : 100);
        const scale = Math.min(1, DISPLAY_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const size = { width: Math.round(video.videoWidth * scale), height: Math.round(video.videoHeight * scale) };
        const opts = {
          showHand: prefs.showHand,
          showTip: prefs.showTip,
          showOutline: prefs.showOutline,
          showBoxes: prefs.showBoxes,
          // Only an actual server result can confirm a selection.
          progress: Math.min(tracking.pending ? 0.99 : 1, dwellProgress(tracking, prefs.dwellMs, Date.now())),
          label,
        };
        // Contours, translated labels and text measurement only change on a detection update.
        if (cachedResult !== result || cachedPrefs !== prefs || cachedLabel !== label ||
            objects.width !== size.width || objects.height !== size.height) {
          drawResult(objects, size, result, { ...opts, showHand: false, showTip: false });
          cachedResult = result;
          cachedPrefs = prefs;
          cachedLabel = label;
        }
        const handVisible = (opts.showHand && displayed.landmarks.length === 21) ||
          (opts.showTip && (displayed.tip !== null || !!displayed.laser));
        if (handVisible) {
          drawResult(canvas, size, displayed, { ...opts, showBoxes: false, showOutline: false });
        } else if (handWasVisible) {
          canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        }
        handWasVisible = handVisible;
      }
      lastPaint = now;
      animation = requestAnimationFrame(paint);
    };
    animation = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(animation);
      clear();
    };
  }, [active, canvasRef, objectsRef, videoRef]);
};
