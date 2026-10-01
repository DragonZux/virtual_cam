import { useEffect, useState, type RefObject } from "react";
import i18next from "i18next";

import { LASER_JPEG_QUALITY, LASER_UPLOAD_MAX_SIDE } from "@/common/constants";
import type { FrameOptions } from "@/common/types";
import { useAppStore } from "@/store/hooks";
import { visionActions } from "@/store/vision";
import type { CameraState } from "@/store/vision/visionSlice";
import { canvasToJpeg, captureFrame } from "@/utils/capture";

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
  source: CameraState["media"];
  options: FrameOptions | null;
}

/** One request per image/settings change or explicit retry; status polling is not a trigger. */
export const useImageFrame = ({ videoRef, active, source, options }: Params) => {
  const store = useAppStore();
  const [retry, setRetry] = useState(0);
  // Compare values, not objects recreated by status polling or unrelated display preferences.
  const optionsKey = options ? JSON.stringify({ ...options, targets: [...options.targets].sort() }) : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!active || source?.kind !== "image" || !video || !optionsKey) return;
    const snapshot = JSON.parse(optionsKey) as FrameOptions;
    let cancelled = false;
    store.dispatch(visionActions.cancelFrames());
    const capture = async () => {
      try {
        const canvas = document.createElement("canvas");
        const laser = snapshot.pointer_mode === "laser";
        if (!captureFrame(video, canvas, false, laser ? LASER_UPLOAD_MAX_SIDE : undefined)) throw new Error("capture");
        const image = await canvasToJpeg(canvas, laser ? LASER_JPEG_QUALITY : undefined);
        if (cancelled) return;
        if (!image) throw new Error("encode");
        store.dispatch(visionActions.analyzeFrameRequest({
          id: store.getState().vision.lastRequestId + 1,
          image, options: snapshot, capturedAt: Date.now(), singleImage: true,
        }));
      } catch {
        if (!cancelled) store.dispatch(visionActions.analyzeFrameFailure({ status: 0, message: i18next.t("test.imageError") }));
      }
    };
    // Debounce slider changes so dragging does not upload the same image for every step.
    const timer = window.setTimeout(() => void capture(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      store.dispatch(visionActions.cancelFrames());
    };
  }, [active, source, optionsKey, retry, store, videoRef]);

  return () => setRetry((value) => value + 1);
};
