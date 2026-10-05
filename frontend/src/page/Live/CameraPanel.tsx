import { Button, Card, Select, Tooltip } from "antd";
import { Aperture, Camera, Cctv, Maximize, Minimize, Pause, Play, Power } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { DISPLAY_MAX_SIDE } from "@/common/constants";
import { useDocumentVisible, useFullscreen, useOverlay, useShortcuts, type useCamera } from "@/hooks";
import { StreamDialog } from "@/components/StreamDialog/StreamDialog";
import type { StreamLink } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences } from "@/store/setting";
import { getConnectRequest, getStreamLinks, streamActions } from "@/store/stream";
import {
  getCamera,
  getConnection,
  getFrameError,
  getFrameResult,
  getSessionStartedAt,
  getTracking,
  getVisionStatus,
  isPaused,
} from "@/store/vision";
import { canvasToPng, captureFrame } from "@/utils/capture";
import { downloadBlob } from "@/utils/download";
import { fileStamp, objectLabel } from "@/utils/format";
import { notify } from "@/utils/notify";
import { displayStreamUrl, streamName } from "@/utils/stream";
import styles from "./live.module.less";

interface Props {
  /** Đang ở trang Tổng quan (trang được giữ mount khi chuyển trang) — chỉ bắt phím tắt lúc hiện */
  visible: boolean;
  /** <video> phát luồng RTSP (LivePage giữ) */
  videoRef: RefObject<HTMLVideoElement | null>;
  source: ReturnType<typeof useCamera>;
}

interface OverlayContent {
  title: string;
  text: string;
  action?: boolean;
}

/** Mục cuối của ô chọn camera: mở hộp thoại thêm camera RTSP */
const ADD_STREAM = "add";

export const CameraPanel = ({ visible, videoRef, source }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const outputRef = useRef<HTMLCanvasElement>(null);
  const objectsRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const camera = useAppSelector(getCamera);
  const paused = useAppSelector(isPaused);
  const connection = useAppSelector(getConnection);
  const status = useAppSelector(getVisionStatus);
  const result = useAppSelector(getFrameResult);
  const receivedAt = useAppSelector((state) => state.vision.lastResultAt);
  const capturedAt = useAppSelector((state) => state.vision.lastCaptureAt);
  const frameError = useAppSelector(getFrameError);
  const tracking = useAppSelector(getTracking);
  const prefs = useAppSelector(getPreferences);
  const sessionStarted = useAppSelector(getSessionStartedAt) !== null;
  const pageVisible = useDocumentVisible();
  const links = useAppSelector(getStreamLinks);
  const connectRequest = useAppSelector(getConnectRequest);
  const { stop, startStream, setPaused } = source;
  const fullscreen = useFullscreen(stageRef);
  const [streamDialog, setStreamDialog] = useState(false);

  const cameraOn = camera.status === "on";
  const mirror = prefs.mirror;
  const interrupted = !!frameError && frameError.status !== 429;

  useOverlay({
    videoRef,
    canvasRef: outputRef,
    objectsRef,
    active: cameraOn && !paused && pageVisible && visible && !interrupted,
    result,
    receivedAt,
    capturedAt,
    tracking,
    prefs,
    label: (name) => objectLabel(t, name),
  });

  // Cài đặt › Camera RTSP bấm "Kết nối": khung camera (luôn mount) mở luồng đó
  useEffect(() => {
    if (!connectRequest) return;
    dispatch(streamActions.connectHandled());
    void startStream(connectRequest);
  }, [connectRequest, dispatch, startStream]);

  /** Luồng vừa dùng, không có thì camera đầu tiên trong Cài đặt */
  const lastStream = camera.stream ?? links[0]?.url ?? null;
  const connect = () => (lastStream ? void startStream(lastStream) : setStreamDialog(true));
  const saveStream = (link: StreamLink) => {
    setStreamDialog(false);
    dispatch(streamActions.saveLink({ link }));
    void startStream(link.url);
  };
  const togglePause = () => cameraOn && setPaused(!paused);

  /** Camera máy chủ đang chạy mà danh sách của trình duyệt này không có (trang khác chọn) */
  const serverOnly = camera.server && !camera.stream ? `server:${camera.server.url}` : null;
  /** Tên camera máy chủ đang nhận diện: tên trong danh sách → tên máy chủ lưu → địa chỉ */
  const currentName = camera.server
    ? streamName(links.find((link) => link.url === camera.stream) ?? { url: camera.server.url, name: camera.server.name ?? undefined })
    : null;
  // Camera đang chạy nhưng đã bị xoá khỏi Cài đặt / chưa có trong danh sách vẫn hiện trong ô chọn
  const sourceOptions = [
    ...links.map((link) => ({ value: link.url, label: streamName(link) })),
    ...(camera.stream && !links.some((link) => link.url === camera.stream)
      ? [{ value: camera.stream, label: currentName ?? displayStreamUrl(camera.stream) }] : []),
    ...(serverOnly ? [{ value: serverOnly, label: currentName ?? serverOnly }] : []),
    { value: ADD_STREAM, label: t("camera.rtsp.add") },
  ];
  const chooseSource = (value: string) => {
    if (value === ADD_STREAM) setStreamDialog(true);
    else if (value !== serverOnly) void startStream(value);
  };

  const snapshot = async () => {
    const overlayCanvas = outputRef.current;
    let blob: Blob | null = null;
    const video = videoRef.current;
    if (overlayCanvas && video && cameraOn && result) {
      // Capture what is currently visible, at 720p; no high-resolution copies during inference.
      const composite = document.createElement("canvas");
      if (captureFrame(video, composite, mirror, DISPLAY_MAX_SIDE)) {
        if (objectsRef.current) composite.getContext("2d")?.drawImage(objectsRef.current, 0, 0, composite.width, composite.height);
        composite.getContext("2d")?.drawImage(overlayCanvas, 0, 0, composite.width, composite.height);
        blob = await canvasToPng(composite);
      }
    }
    if (!blob) {
      notify.info(t("camera.snapshotEmpty"));
      return;
    }
    downloadBlob(blob, `hicascam-${fileStamp()}.png`);
    notify.success(t("camera.snapshotSaved"));
  };

  const toggleFullscreen = () =>
    fullscreen
      .toggle()
      .then((ok) => ok || notify.info(t("camera.fullscreenUnsupported")))
      .catch(() => notify.info(t("camera.fullscreenUnsupported")));

  useShortcuts(visible, { space: togglePause, s: snapshot, f: toggleFullscreen });

  const overlay = ((): OverlayContent | null => {
    if (camera.status === "starting") {
      return { title: t("camera.rtsp.startingTitle"), text: t("camera.rtsp.startingText", { url: displayStreamUrl(camera.stream ?? "") }) };
    }
    if (camera.status === "error") {
      const text = camera.message ?? t(`camera.errors.${camera.error ?? "default"}`, { defaultValue: t("camera.errors.default") });
      return { title: t("camera.overlay.errorTitle"), text, action: true };
    }
    if (camera.status === "off") {
      if (!lastStream) return { title: t("camera.overlay.noStreamTitle"), text: t("camera.overlay.noStreamText"), action: true };
      if (sessionStarted) return { title: t("camera.overlay.stoppedTitle"), text: t("camera.overlay.stoppedText"), action: true };
      return { title: t("camera.overlay.introTitle"), text: t("camera.overlay.introText"), action: true };
    }
    if (paused) return { title: t("camera.overlay.pausedTitle"), text: t("camera.overlay.pausedText") };
    if (connection === "offline") return { title: t("camera.overlay.offlineTitle"), text: t("camera.overlay.offlineText") };
    if (status?.phase === "error") return { title: t("camera.overlay.serverErrorTitle"), text: status.error ?? "" };
    if (status?.laser_error) return { title: t("pointer.unavailableTitle"), text: t("pointer.modelUnavailable") };
    if (interrupted) {
      return { title: t("camera.overlay.waitingTitle"), text: frameError.message || t("camera.overlay.slowText") };
    }
    return null;
  })();

  const badge = !cameraOn
    ? camera.status === "starting"
      ? "starting"
      : sessionStarted
        ? "off"
        : "idle"
    : paused
      ? "paused"
      : interrupted
        ? "interrupted"
        : result
          ? "live"
          : "starting";

  const streamLabel = !cameraOn
    ? t("camera.stream.off")
    : paused
      ? t("camera.stream.paused")
      : !pageVisible
        ? t("camera.stream.hidden")
        : interrupted
          ? t("camera.stream.retrying")
          : result
            ? t("camera.stream.live", { ms: result.processing_ms })
            : t("camera.stream.waiting");

  return (
    <Card
      className={styles.cameraCard}
      title={
        <span className={styles.cardTitle}>
          <Camera size={17} />
          {t("camera.title")}
        </span>
      }
      extra={
        <Select
          size="small"
          className={styles.cameraSelect}
          aria-label={t("camera.select")}
          placeholder={t("camera.select")}
          value={camera.stream ?? serverOnly ?? undefined}
          disabled={camera.status === "starting"}
          popupMatchSelectWidth={false}
          options={sourceOptions}
          onChange={chooseSource}
        />
      }
    >
      <div ref={stageRef} className={styles.stage}>
        {/* Video chạy trực tiếp theo camera; canvas trong suốt đè lên vẽ kết quả (toạ độ đã theo chế độ gương) */}
        <video
          ref={videoRef}
          className={`${styles.media} ${mirror ? styles.mirrored : ""} ${cameraOn ? "" : styles.hidden}`}
          autoPlay
          muted
          playsInline
        />
        <canvas
          ref={objectsRef}
          className={`${styles.overlayCanvas} ${cameraOn && result && !paused ? "" : styles.hidden}`}
          aria-hidden="true"
        />
        <canvas
          ref={outputRef}
          className={`${styles.overlayCanvas} ${cameraOn && result && !paused ? "" : styles.hidden}`}
          aria-label={t("camera.canvasLabel")}
          role="img"
        />
        {overlay && (
          <div className={styles.overlay}>
            <div className={styles.scanSymbol}>
              <Camera size={27} strokeWidth={1.5} />
            </div>
            <strong>{overlay.title}</strong>
            <p>{overlay.text}</p>
            {overlay.action && (
              <div className={styles.overlayActions}>
                {lastStream && <Button type="primary" icon={<Camera size={16} />} onClick={connect}>
                  {t(camera.status === "error" ? "camera.reconnect" : "camera.connect")}
                </Button>}
                <Button type={lastStream ? "default" : "primary"} ghost={!!lastStream} icon={<Cctv size={16} />}
                  onClick={() => setStreamDialog(true)}>{t("camera.rtsp.open")}</Button>
              </div>
            )}
          </div>
        )}
        <div className={styles.badges}>
          <span className={`${styles.liveBadge} ${badge === "live" ? styles.isLive : ""}`}>
            <span className={styles.badgeDot} />
            {t(`camera.badge.${badge}`)}
          </span>
          <span className={styles.resolutionBadge}>
            {result ? `${result.resolution.width} × ${result.resolution.height}` : "— × —"}
          </span>
        </div>
        <div className={styles.caption}>
          <span className={styles.frameCorner} />
          {currentName && cameraOn ? t("camera.rtsp.caption", { url: currentName }) : t("pointer.caption")}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.streamInfo}>
          <span className={`${styles.badgeDot} ${badge === "live" ? styles.dotLive : ""}`} />
          {streamLabel}
        </div>
        <div className={styles.actions}>
          <Button
            size="small"
            type="text"
            icon={paused ? <Play size={14} /> : <Pause size={14} />}
            disabled={!cameraOn}
            onClick={togglePause}
          >
            {paused ? t("camera.resume") : t("camera.pause")}
          </Button>
          <Button size="small" type="text" icon={<Aperture size={14} />} disabled={!result} onClick={snapshot}>
            {t("camera.snapshot")}
          </Button>
          <Button size="small" type="text" icon={<Power size={14} />} disabled={!cameraOn} onClick={() => stop()}>
            {t("camera.stop")}
          </Button>
          <Tooltip title={fullscreen.active ? t("camera.exitFullscreen") : t("camera.fullscreen")}>
            <Button
              size="small"
              type="text"
              aria-label={fullscreen.active ? t("camera.exitFullscreen") : t("camera.fullscreen")}
              icon={fullscreen.active ? <Minimize size={15} /> : <Maximize size={15} />}
              onClick={toggleFullscreen}
            />
          </Tooltip>
        </div>
      </div>
      {streamDialog && <StreamDialog onCancel={() => setStreamDialog(false)} onSave={saveStream} />}
    </Card>
  );
};
