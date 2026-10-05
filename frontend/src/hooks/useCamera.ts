import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { firstValueFrom } from "rxjs";
import type { AjaxError } from "rxjs/ajax";

import { CameraService } from "@/Services/CameraService";
import { extractApiErrorMessage } from "@/Services/HttpClient";
import { LiveService, type LiveConnection, type LiveOptions } from "@/Services/LiveService";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { getFrameOptions, getPreferences } from "@/store/setting";
import { visionActions } from "@/store/vision";
import { displayStreamUrl } from "@/utils/stream";
import { useDocumentVisible } from "./useDocumentVisible";

/**
 * Camera do máy chủ giữ (tối đa một, chạy cả khi đóng trang). Trang mở một WebSocket chỉ để xem
 * (Services/LiveService.ts, tự nối lại): máy chủ đẩy trạng thái camera, hình JPEG và kết quả nhận diện.
 * Kết nối / Tắt / Tạm dừng gọi REST (Services/CameraService.ts) — mọi trang đang xem cùng thấy thay đổi.
 * Hình vẽ vào canvas → <video> nên lớp vẽ, ảnh chụp và toàn màn hình dùng <video> như camera thường;
 * giải mã chậm hơn tốc độ nhận thì chỉ giữ khung mới nhất. Tab ẩn: báo máy chủ ngừng gửi hình cho trang này.
 */
export const useCamera = (videoRef: RefObject<HTMLVideoElement | null>) => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const options = useAppSelector(getFrameOptions);
  const dwellMs = useAppSelector(getPreferences).dwellMs;
  const pageVisible = useDocumentVisible();
  const connectionRef = useRef<LiveConnection | null>(null);

  // Trạng thái hỏi định kỳ tạo mảng targets mới mỗi lần: so theo nội dung để không gửi lại tuỳ chọn không đổi
  const optionsKey = JSON.stringify([options?.targets ?? null, options?.conf ?? null, dwellMs]);
  const liveOptions = useMemo((): LiveOptions => {
    const [targets, confidence, dwell] = JSON.parse(optionsKey) as [string[] | null, number | null, number];
    return { targets, confidence, dwell_ms: dwell };
  }, [optionsKey]);
  const latest = useRef({ options: liveOptions, visible: pageVisible });

  useEffect(() => {
    latest.current.options = liveOptions;
    connectionRef.current?.sendOptions(liveOptions);
  }, [liveOptions]);

  useEffect(() => {
    latest.current.visible = pageVisible;
    connectionRef.current?.sendVideo(pageVisible);
    if (!pageVisible) dispatch(visionActions.clearResult());
  }, [dispatch, pageVisible]);

  useEffect(() => {
    const video = videoRef.current;
    const ctx = document.createElement("canvas").getContext("2d", { alpha: false });
    if (!video || !ctx) return;
    const { canvas } = ctx;
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    let closed = false;
    let decoding = false;
    /** Khung đến trong lúc đang giải mã: chỉ giữ cái mới nhất */
    let waiting: Blob | null = null;

    const draw = async (first: Blob) => {
      decoding = true;
      let next: Blob | null = first;
      try {
        while (next && !closed) {
          const bitmap = await createImageBitmap(next);
          next = waiting;
          waiting = null;
          if (closed) {
            bitmap.close();
            break;
          }
          if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
          if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          track.requestFrame();
          if (video.srcObject !== stream) {
            video.srcObject = stream;
            await video.play().catch(() => undefined);
          }
        }
      } catch {
        // Khung hỏng: bỏ, khung sau vẽ tiếp
      } finally {
        decoding = false;
      }
    };

    const connection = LiveService.watch({
      onOpen: () => {
        connection.sendOptions(latest.current.options);
        connection.sendVideo(latest.current.visible);
      },
      onFrame: (jpeg) => {
        if (decoding) waiting = jpeg;
        else void draw(jpeg);
      },
      onMessage: (message) => {
        if (message.type === "camera") {
          const { type: _type, ...info } = message;
          // Máy chủ chỉ gửi địa chỉ không mật khẩu: tìm lại link đầy đủ trong danh sách của trình duyệt này
          const link = info.url ? store.getState().stream.links.find((item) => displayStreamUrl(item.url) === info.url) : undefined;
          dispatch(visionActions.cameraInfo({ info, stream: link?.url ?? null, at: Date.now() }));
          if (info.status === "off") {
            waiting = null;
            video.srcObject = null;
          }
          return;
        }
        // Kết quả gửi trước lúc máy chủ nhận "tab ẩn" / "tạm dừng"
        const { vision } = store.getState();
        if (!latest.current.visible || vision.paused || vision.camera.status !== "on") return;
        const at = Date.now();
        const { held, pending } = message.tracking;
        dispatch(visionActions.liveResult({
          result: message.result,
          tracking: {
            held,
            heldAt: held ? at : 0,
            pending: pending ? { name: pending.name, since: at - pending.elapsed_ms } : null,
          },
          at,
          capturedAt: at - message.latency_ms,
        }));
      },
    });
    connectionRef.current = connection;
    return () => {
      closed = true;
      connection.close();
      connectionRef.current = null;
      stream.getTracks().forEach((item) => item.stop());
      video.srcObject = null;
    };
  }, [dispatch, store, videoRef]);

  /** Máy chủ chạy camera này thay camera đang chạy */
  const startStream = useCallback(async (url: string) => {
    const name = store.getState().stream.links.find((link) => link.url === url)?.name;
    dispatch(visionActions.streamStarting(url));
    try {
      await firstValueFrom(CameraService.start(url, name));
    } catch (error) {
      dispatch(visionActions.cameraFailed(extractApiErrorMessage(error as AjaxError) ?? null));
    }
  }, [dispatch, store]);

  /** Tắt camera trên máy chủ (đóng trang thì camera vẫn chạy) */
  const stop = useCallback(() => {
    dispatch(visionActions.cameraStopped());
    void firstValueFrom(CameraService.stop()).catch(() => undefined);
  }, [dispatch]);

  const setPaused = useCallback((paused: boolean) => {
    dispatch(visionActions.setPaused(paused));
    void firstValueFrom(CameraService.setDetect(!paused)).catch(() => dispatch(visionActions.setPaused(!paused)));
  }, [dispatch]);

  return { stop, startStream, setPaused };
};
