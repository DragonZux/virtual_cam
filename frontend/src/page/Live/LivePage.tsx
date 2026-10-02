import { Col, Row } from "antd";
import { Boxes, Target } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { ObjectIcon, StatCard } from "@/components";
import { useCamera } from "@/hooks";
import { useAppSelector } from "@/store/hooks";
import { getCamera, getFrameResult, getTracking, getVisionStatus } from "@/store/vision";
import { objectLabel } from "@/utils/format";
import { CameraPanel } from "./CameraPanel";
import styles from "./live.module.less";

interface Props {
  visible: boolean;
}

/** Trạng thái theo từng khung: tách riêng để không render lại camera */
const LiveMetrics = () => {
  const { t } = useTranslation();
  const result = useAppSelector(getFrameResult);
  const status = useAppSelector(getVisionStatus);
  const { held, pending } = useAppSelector(getTracking);
  const cameraOn = useAppSelector(getCamera).status === "on";
  // Vật thể đã xác nhận (held) hoặc đang giữ chấm laser chờ xác nhận (pending)
  const name = held?.name ?? pending?.name ?? null;
  const laserState = !cameraOn || !result ? "idle" : result.laser ? "found" : "missing";
  const laserHint = status?.laser_error
    ? t("pointer.modelUnavailable")
    : !status?.laser_model
      ? t("pointer.redModelLoading")
      : t(result?.laser ? "pointer.noteFound" : "pointer.noteMissing");

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={8}>
        <StatCard
          textual
          highlight={!!held}
          title={t("selection.title")}
          value={name ? objectLabel(t, name) : t("selection.none")}
          hint={held
            ? t("selection.confidenceValue", { value: Math.round(held.confidence * 100) })
            : t(pending ? "selection.holding" : "selection.idleHint")}
          icon={name ? <ObjectIcon name={name} size={18} /> : <Target size={18} />}
          tone="brand"
        />
      </Col>
      <Col xs={12} lg={8}>
        <StatCard
          textual
          title={t("pointer.status")}
          value={t(`pointer.${laserState}`)}
          hint={laserHint}
          icon={<Target size={18} />}
          tone="blue"
        />
      </Col>
      <Col xs={12} lg={8}>
        <StatCard
          title={t("metrics.objects")}
          value={cameraOn && result ? result.detections.length : "—"}
          hint={t("metrics.objectsNote")}
          icon={<Boxes size={18} />}
          tone="dark"
        />
      </Col>
    </Row>
  );
};

export const LivePage = ({ visible }: Props) => {
  // Webcam hoặc luồng RTSP đều phát vào chung một <video>
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = useCamera(videoRef);

  return (
    <div className={styles.page}>
      <LiveMetrics />
      <CameraPanel visible={visible} videoRef={videoRef} source={source} />
    </div>
  );
};
