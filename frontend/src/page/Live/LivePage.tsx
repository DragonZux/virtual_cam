import { Col, Row, Upload } from "antd";
import { Activity, Hand, History, Target, Upload as UploadIcon } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { StatCard } from "@/components";
import { useCamera } from "@/hooks";
import { getSelectionTotal } from "@/store/history";
import { useAppSelector } from "@/store/hooks";
import { getPreferences } from "@/store/setting";
import { getCamera, getFps, getFrameResult } from "@/store/vision";
import { MEDIA_ACCEPT, mediaKindOf } from "@/utils/media";
import { TestResults } from "@/page/Test/TestResults";
import { notify } from "@/utils/notify";
import { CameraPanel } from "./CameraPanel";
import { RecentSelections } from "./RecentSelections";
import { SelectionCard } from "./SelectionCard";
import { TargetsCard } from "./TargetsCard";
import styles from "./live.module.less";

interface Props {
  visible: boolean;
  testMode?: boolean;
}

/** Per-frame counters must not render the history and controls. */
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

export const LivePage = ({ visible, testMode = false }: Props) => {
  const { t } = useTranslation();
  // Camera hoặc ảnh / video chọn từ máy đều phát vào chung một <video>
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useCamera(videoRef);

  /** Phát ảnh / video ngay trên trình duyệt (không tải lên máy chủ) */
  const openFile = (file: File) => {
    const kind = mediaKindOf(file.name);
    if (!kind) {
      notify.error(t("media.unsupported"));
      return;
    }
    void source.playMedia({ url: URL.createObjectURL(file), name: file.name, kind });
  };

  return (
    <div className={styles.page}>
      {testMode ? <Upload.Dragger accept={MEDIA_ACCEPT} showUploadList={false} beforeUpload={(file) => {
        openFile(file);
        return Upload.LIST_IGNORE;
      }}>
        <UploadIcon size={28} />
        <p className="ant-upload-text">{t("test.uploadTitle")}</p>
        <p className="ant-upload-hint">{t("test.uploadHelp")}</p>
      </Upload.Dragger> : <LiveMetrics />}

      <div className={styles.monitor}>
        <CameraPanel visible={visible} videoRef={videoRef} source={source} testMode={testMode} />
        <div className={styles.side}>
          <SelectionCard />
          {testMode ? <TestResults /> : <TargetsCard />}
        </div>
      </div>

      {!testMode && <RecentSelections />}
    </div>
  );
};
