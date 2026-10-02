import { useCallback, useEffect, useRef, type RefObject } from "react";
import { firstValueFrom } from "rxjs";
import type { AjaxError } from "rxjs/ajax";

import { IMAGE_MAX_SIDE } from "@/common/constants";
import type { CameraDevice, MediaSource } from "@/common/types";
import { CameraService } from "@/Services/CameraService";
import { useAppDispatch } from "@/store/hooks";
import { visionActions } from "@/store/vision";

/** Luồng RTSP: số lần liên tiếp không lấy được khung (mỗi lần máy chủ chờ ~3 giây) trước khi báo mất kết nối */
const STREAM_MAX_FAILURES = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lỗi getUserMedia có bản dịch ở camera.errors.<code> */
const KNOWN_ERRORS = ["NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"];

const errorCode = (error: unknown): string => {
  const name = (error as { name?: string })?.name ?? "";
  return KNOWN_ERRORS.includes(name) ? name : "default";
};

/**
 * Vòng đời nguồn hình của khung camera: camera trình duyệt hoặc ảnh / video thử, cùng phát trong một <video>
 * nên vòng gửi khung, lớp vẽ và "giữ để xác nhận" không cần biết nguồn. Stream giữ trong ref (không đưa vào store),
 * trạng thái đẩy vào store để header, bảng số liệu… cùng đọc. Mỗi lần bật/tắt tăng `run` để bỏ qua kết quả của lần bật cũ.
 */
export const useCamera = (videoRef: RefObject<HTMLVideoElement | null>) => {
  const dispatch = useAppDispatch();
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  /** Dọn phần riêng của ảnh / video thử (bộ vẽ lại ảnh, blob URL, listener lỗi) */
  const cleanupRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
      video.loop = false;
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    }
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
      dispatch(visionActions.cameraStarting("camera"));
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

  /**
   * Video lặp lại; ảnh chỉ vẽ một khung vào video để dùng chung phần hiển thị / chụp ảnh.
   * Không vẽ lại ảnh theo timer. blob: URL được thu hồi khi đổi nguồn / tắt.
   */
  const playMedia = useCallback(
    async (media: MediaSource) => {
      release();
      const run = runRef.current;
      const video = videoRef.current;
      const revoke = () => media.url.startsWith("blob:") && URL.revokeObjectURL(media.url);
      if (!video) {
        revoke();
        return;
      }
      cleanupRef.current = revoke;
      dispatch(visionActions.cameraStarting("media"));
      const fail = () => {
        if (run !== runRef.current) return;
        release();
        dispatch(visionActions.cameraFailed("media"));
      };
      try {
        if (media.kind === "video") {
          video.addEventListener("error", fail);
          cleanupRef.current = () => {
            video.removeEventListener("error", fail);
            revoke();
          };
          video.crossOrigin = "anonymous";
          video.loop = true;
          video.src = media.url;
          await video.play();
        } else {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.src = media.url;
          await image.decode();
          if (run !== runRef.current) return;
          const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(16, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(16, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const stream = canvas.captureStream(0);
          streamRef.current = stream;
          video.srcObject = stream;
          (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
          await video.play();
        }
        if (run !== runRef.current) return;
        dispatch(visionActions.mediaStarted({ name: media.name, kind: media.kind, startedAt: Date.now() }));
      } catch {
        fail();
      }
    },
    [dispatch, release, videoRef],
  );

  /**
   * Camera RTSP (MediaMTX, camera IP): máy chủ đọc luồng, trang lấy lần lượt từng khung JPEG mới nhất và vẽ vào
   * canvas → <video> như ảnh thử, nên vòng gửi khung / lớp vẽ / chụp ảnh dùng chung với webcam.
   */
  const startStream = useCallback(
    async (url: string) => {
      release();
      const run = runRef.current;
      const video = videoRef.current;
      const ctx = document.createElement("canvas").getContext("2d", { alpha: false });
      if (!video || !ctx) return;
      dispatch(visionActions.streamStarting(url));
      let id: string;
      try {
        id = (await firstValueFrom(CameraService.openStream(url))).id;
      } catch {
        if (run === runRef.current) dispatch(visionActions.cameraFailed("stream"));
        return;
      }
      const close = () => void firstValueFrom(CameraService.closeStream(id)).catch(() => undefined);
      if (run !== runRef.current) {
        close();
        return;
      }
      cleanupRef.current = close;
      const { canvas } = ctx;
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      streamRef.current = stream;
      let started = false;
      let failures = 0;
      while (run === runRef.current) {
        try {
          const bitmap = await createImageBitmap(await firstValueFrom(CameraService.frame(id)));
          if (run !== runRef.current) {
            bitmap.close();
            break;
          }
          if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
          if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          track.requestFrame();
          failures = 0;
          if (!started) {
            started = true;
            video.srcObject = stream;
            await video.play().catch(() => undefined);
            // facingMode "environment": chế độ gương "tự động" không lật hình camera RTSP
            dispatch(visionActions.cameraStarted({ deviceId: null, facingMode: "environment", stream: url, startedAt: Date.now() }));
          }
        } catch (error) {
          if (run !== runRef.current) break;
          // 404: máy chủ đã đóng phiên (khởi động lại…); 504: luồng chưa có khung mới, máy chủ đang kết nối lại
          if ((error as AjaxError)?.status === 404 || ++failures >= STREAM_MAX_FAILURES) {
            release();
            dispatch(visionActions.cameraFailed("stream"));
            break;
          }
          await wait(500);
        }
      }
    },
    [dispatch, release, videoRef],
  );

  // Rời trang / đóng tab: tắt đèn camera ngay
  useEffect(() => {
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      stop();
    };
  }, [release, stop]);

  return { start, stop, playMedia, startStream };
};
