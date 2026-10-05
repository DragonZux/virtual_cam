import { useCallback, useEffect, useRef, type RefObject } from "react";
import { firstValueFrom } from "rxjs";
import type { AjaxError } from "rxjs/ajax";

import { CameraService } from "@/Services/CameraService";
import { useAppDispatch } from "@/store/hooks";
import { visionActions } from "@/store/vision";

/** Số lần liên tiếp không lấy được khung (mỗi lần máy chủ chờ ~3 giây) trước khi báo mất kết nối */
const STREAM_MAX_FAILURES = 5;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Camera RTSP (MediaMTX, camera IP): máy chủ đọc luồng, trang lấy lần lượt từng khung JPEG mới nhất và vẽ vào
 * canvas → <video>, nên vòng gửi khung, lớp vẽ và "giữ để xác nhận" dùng <video> như camera thường.
 * Stream giữ trong ref (không đưa vào store), trạng thái đẩy vào store để header, bảng số liệu… cùng đọc.
 * Mỗi lần bật/tắt tăng `run` để bỏ qua kết quả của lần bật cũ.
 */
export const useCamera = (videoRef: RefObject<HTMLVideoElement | null>) => {
  const dispatch = useAppDispatch();
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  /** Đóng phiên đọc luồng ở máy chủ */
  const cleanupRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, [videoRef]);

  const stop = useCallback(() => {
    release();
    dispatch(visionActions.cameraStopped());
  }, [dispatch, release]);

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
            dispatch(visionActions.cameraStarted({ stream: url, startedAt: Date.now() }));
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

  // Rời trang / đóng tab: đóng luồng ngay
  useEffect(() => {
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      stop();
    };
  }, [release, stop]);

  return { stop, startStream };
};
