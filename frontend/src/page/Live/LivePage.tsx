import { Col, Row } from "antd";
import { Activity, Hand, History, Target } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import type { MediaItem } from "@/common/types";
import { StatCard } from "@/components";
import { useCamera } from "@/hooks";
import { getSelectionTotal } from "@/store/history";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getMediaMaxBytes, mediaActions } from "@/store/media";
import { getPreferences } from "@/store/setting";
import { getCamera, getFps, getFrameResult } from "@/store/vision";
import { mediaKindOf, mediaUrl } from "@/utils/media";
import { notify } from "@/utils/notify";
import { CameraPanel } from "./CameraPanel";
import { MediaCard } from "./MediaCard";
import { RecentSelections } from "./RecentSelections";
import { SelectionCard } from "./SelectionCard";
import { TargetsCard } from "./TargetsCard";
import styles from "./live.module.less";

interface Props {
  visible: boolean;
}

/** Per-frame counters must not render the media picker, history and controls. */
const LiveMetrics = () => {
  const { t } = useTranslation();
  const fps = useAppSelector(getFps);
  const result = useAppSelector(getFrameResult);
  const cameraOn = useAppSelector(getCamera).status === "on";
  const total = useAppSelector(getSelectionTotal);
  const laser = useAppSelector(getPreferences).pointerMode === "laser";
  const laserState = !cameraOn || !result ? "idle" : result.laser ? "found" : "missing";
  const hand = !cameraOn || !result ? "handIdle" : result.hand_detected ? "handFound" : "handMissing";

  return (
    <Row gutter={[16, 16]}>
      <Col xs={12} lg={6}>
        <StatCard
          title={t("metrics.fps")}
          value={cameraOn && fps !== null ? fps.toFixed(1) : "—"}
          suffix="FPS"
          hint={t("metrics.fpsNote")}
          icon={<Activity size={18} />}
          tone="brand"
        />
      </Col>
      <Col xs={12} lg={6}>
        <StatCard
          textual
          title={t(laser ? "pointer.status" : "metrics.hand")}
          value={laser ? t(`pointer.${laserState}`) : t(`metrics.${hand}`)}
          hint={
            laser
              ? t(result?.laser ? "pointer.noteFound" : "pointer.noteMissing")
              : hand === "handFound"
                ? t("metrics.handNoteFound")
                : t("metrics.handNoteMissing")
          }
          icon={laser ? <Target size={18} /> : <Hand size={18} />}
          tone="blue"
        />
      </Col>
      <Col xs={12} lg={6}>
        <StatCard
          title={t("metrics.objects")}
          value={cameraOn && result ? result.detections.length : "—"}
          hint={t("metrics.objectsNote")}
          icon={<Target size={18} />}
          tone="dark"
        />
      </Col>
      <Col xs={12} lg={6}>
        <StatCard
          title={t("metrics.selections")}
          value={total}
          hint={t("metrics.selectionsNote")}
          icon={<History size={18} />}
          tone="purple"
        />
      </Col>
    </Row>
  );
};

export const LivePage = ({ visible }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  // Khung camera và thẻ Ảnh / video thử dùng chung một <video>: camera hoặc file đều phát vào đây
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useCamera(videoRef);
  const maxBytes = useAppSelector(getMediaMaxBytes);

  /** File mới: phát ngay từ máy (không chờ tải lên) và lưu song song vào thư mục của máy chủ */
  const openFile = (file: File) => {
    const kind = mediaKindOf(file.name);
    if (!kind) {
      notify.error(t("media.unsupported"));
      return;
    }
    if (maxBytes !== null && file.size > maxBytes) {
      notify.error(t("media.tooLarge", { mb: Math.round(maxBytes / 1024 / 1024) }));
      return;
    }
    void source.playMedia({ url: URL.createObjectURL(file), name: file.name, kind });
    dispatch(mediaActions.uploadRequest(file));
  };

  const openSaved = (item: MediaItem) => {
    void source.playMedia({ url: mediaUrl(item.name), name: item.name, kind: item.kind });
  };

  return (
    <div className={styles.page}>
      <LiveMetrics />

      <div className={styles.monitor}>
        <CameraPanel visible={visible} videoRef={videoRef} source={source} onOpenFile={openFile} />
        <div className={styles.side}>
          <SelectionCard />
          <MediaCard onOpenFile={openFile} onOpenSaved={openSaved} />
          <TargetsCard />
        </div>
      </div>

      <RecentSelections />
    </div>
  );
};
