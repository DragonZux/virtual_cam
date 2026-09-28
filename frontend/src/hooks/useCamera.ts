import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { CameraDevice } from "@/common/types";
import { useAppDispatch } from "@/store/hooks";
import { visionActions } from "@/store/vision";

/** Lỗi getUserMedia có bản dịch ở camera.errors.<code> */
const KNOWN_ERRORS = ["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"];

const errorCode = (error: unknown): string => {
  const name = (error as { name?: string })?.name ?? "";
  return KNOWN_ERRORS.includes(name) ? name : "default";
};

/**
 * Vòng đời camera của trình duyệt: stream giữ trong ref (không đưa vào store), trạng thái đẩy vào store
 * để header, bảng số liệu… cùng đọc. Mỗi lần bật/tắt tăng `run` để bỏ qua kết quả của lần bật cũ.
 */
export const useCamera = (videoRef: RefObject<HTMLVideoElement | null>) => {
  const dispatch = useAppDispatch();
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);

  const release = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [videoRef]);

  const stop = useCallback(
    (ended = false) => {
      release();
      dispatch(visionActions.cameraStopped({ ended }));
    },
    [dispatch, release],
  );

  const start = useCallback(
    async (deviceId?: string) => {
      release();
      const run = runRef.current;
      dispatch(visionActions.cameraStarting());
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          dispatch(visionActions.cameraFailed("insecure"));
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            // Điện thoại: mặc định camera sau để chỉ vào đồ vật; laptop bỏ qua facingMode
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" }),
          },
        });
        if (run !== runRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        // Tên camera chỉ có sau khi được cấp quyền
        const devices: CameraDevice[] = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === "videoinput")
          .map((device) => ({ deviceId: device.deviceId, label: device.label }));
        if (run !== runRef.current) return;
        const [track] = stream.getVideoTracks();
        track.addEventListener("ended", () => {
          if (run === runRef.current) stop(true);
        });
        const settings = track.getSettings();
        dispatch(
          visionActions.cameraStarted({
            deviceId: settings.deviceId ?? deviceId ?? null,
            facingMode: settings.facingMode ?? null,
            devices,
            startedAt: Date.now(),
          }),
        );
      } catch (error) {
        if (run !== runRef.current) return;
        release();
        dispatch(visionActions.cameraFailed(errorCode(error)));
      }
    },
    [dispatch, release, stop, videoRef],
  );

  // Rời trang / đóng tab: tắt đèn camera ngay
  useEffect(() => {
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [release]);

  return { start, stop };
};
