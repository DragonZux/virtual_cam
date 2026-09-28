import { Button, Card, Select, Tooltip } from "antd";
import { Aperture, Camera, Maximize, Minimize, Pause, Play, Power } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { DISPLAY_MAX_SIDE } from "@/common/constants";
import { PointerControls } from "@/components/PointerControls/PointerControls";
import { useCamera, useDocumentVisible, useFrameLoop, useFullscreen, useOverlay, useShortcuts } from "@/hooks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getFrameOptions, getPreferences } from "@/store/setting";
import {
  getCamera,
  getConnection,
  getFrameError,
  getFrameResult,
  getSessionStartedAt,
  getTracking,
  getVisionStatus,
  isDetectorReady,
  isPaused,
  selectMirror,
  visionActions,
} from "@/store/vision";
import { canvasToPng, captureFrame } from "@/utils/capture";
import { downloadBlob } from "@/utils/download";
import { fileStamp, objectLabel } from "@/utils/format";
import { notify } from "@/utils/notify";
import styles from "./live.module.less";

interface Props {
  /** Đang ở trang Tổng quan (trang được giữ mount khi chuyển trang) — chỉ bắt phím tắt lúc hiện */
  visible: boolean;
}

interface OverlayContent {
  title: string;
  text: string;
  action?: boolean;
}

export const CameraPanel = ({ visible }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const videoRef = useRef<HTMLVideoElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const objectsRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const camera = useAppSelector(getCamera);
  const paused = useAppSelector(isPaused);
  const ready = useAppSelector(isDetectorReady);
  const connection = useAppSelector(getConnection);
  const status = useAppSelector(getVisionStatus);
  const result = useAppSelector(getFrameResult);
  const receivedAt = useAppSelector((state) => state.vision.lastResultAt);
  const capturedAt = useAppSelector((state) => state.vision.lastCaptureAt);
  const frameError = useAppSelector(getFrameError);
  const tracking = useAppSelector(getTracking);
  const prefs = useAppSelector(getPreferences);
  const options = useAppSelector(getFrameOptions);
  const sessionStarted = useAppSelector(getSessionStartedAt) !== null;
  const pageVisible = useDocumentVisible();
  const { start, stop } = useCamera(videoRef);
  const fullscreen = useFullscreen(stageRef);

  const cameraOn = camera.status === "on";
  const mirror = selectMirror(prefs.mirror, camera.facingMode);
  const interrupted = !!frameError && frameError.status !== 429;
  useFrameLoop({
    videoRef,
    active: cameraOn && !paused && pageVisible && ready && options !== null,
    mirror,
    options,
  });

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

  const startCamera = () => start(camera.status === "error" ? undefined : (camera.deviceId ?? undefined));
  const togglePause = () => cameraOn && dispatch(visionActions.setPaused(!paused));

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
    downloadBlob(blob, `virtual-cam-${fileStamp()}.png`);
    notify.success(t("camera.snapshotSaved"));
  };

  const toggleFullscreen = () =>
    fullscreen
      .toggle()
      .then((ok) => ok || notify.info(t("camera.fullscreenUnsupported")))
      .catch(() => notify.info(t("camera.fullscreenUnsupported")));

  useShortcuts(visible, { space: togglePause, s: snapshot, f: toggleFullscreen });

  const overlay = ((): OverlayContent | null => {
    if (camera.status === "starting") return { title: t("camera.overlay.startingTitle"), text: t("camera.overlay.startingText") };
    if (camera.status === "error") {
      const text = t(`camera.errors.${camera.error ?? "default"}`, { defaultValue: t("camera.errors.default") });
      return { title: t("camera.overlay.errorTitle"), text, action: true };
    }
    if (camera.status === "off") {
      if (camera.ended) return { title: t("camera.overlay.endedTitle"), text: t("camera.overlay.endedText"), action: true };
      if (sessionStarted) return { title: t("camera.overlay.stoppedTitle"), text: t("camera.overlay.stoppedText"), action: true };
      return { title: t("camera.overlay.introTitle"), text: t("camera.overlay.introText"), action: true };
    }
    if (paused) return { title: t("camera.overlay.pausedTitle"), text: t("camera.overlay.pausedText") };
    if (connection === "offline") return { title: t("camera.overlay.offlineTitle"), text: t("camera.overlay.offlineText") };
    if (status?.phase === "error") return { title: t("camera.overlay.serverErrorTitle"), text: status.error ?? "" };
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
          value={camera.deviceId ?? undefined}
          disabled={!cameraOn || camera.devices.length < 2}
          popupMatchSelectWidth={false}
          options={camera.devices.map((device, index) => ({
            value: device.deviceId,
            label: device.label || t("camera.deviceFallback", { index: index + 1 }),
          }))}
          onChange={(deviceId: string) => start(deviceId)}
        />
      }
    >
      <PointerControls />
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
              <Button type="primary" icon={<Camera size={16} />} onClick={startCamera}>
                {t("camera.start")}
              </Button>
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
          {t(prefs.pointerMode === "laser" ? "pointer.caption" : "camera.caption")}
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
    </Card>
  );
};
