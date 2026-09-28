import { Col, Row } from "antd";
import { Activity, Hand, History, Target } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StatCard } from "@/components";
import { getSelectionTotal } from "@/store/history";
import { useAppSelector } from "@/store/hooks";
import { getPreferences } from "@/store/setting";
import { getCamera, getFps, getFrameResult } from "@/store/vision";
import { CameraPanel } from "./CameraPanel";
import { RecentSelections } from "./RecentSelections";
import { SelectionCard } from "./SelectionCard";
import { TargetsCard } from "./TargetsCard";
import styles from "./live.module.less";

interface Props {
  visible: boolean;
}

export const LivePage = ({ visible }: Props) => {
  const { t } = useTranslation();
  const fps = useAppSelector(getFps);
  const result = useAppSelector(getFrameResult);
  const cameraOn = useAppSelector(getCamera).status === "on";
  const total = useAppSelector(getSelectionTotal);
  const laser = useAppSelector(getPreferences).pointerMode === "laser";
  const laserState = !cameraOn || !result ? "idle" : result.laser ? "found" : "missing";
  const hand = !cameraOn || !result ? "handIdle" : result.hand_detected ? "handFound" : "handMissing";

  return (
    <div className={styles.page}>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <StatCard
            title={t("metrics.fps")}
            value={cameraOn && fps !== null ? fps.toFixed(1) : "—"}
            suffix="FPS"
            hint={t("metrics.fpsNote")}
            icon={<Activity size={18} />}
            tone="mint"
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            textual
            title={t(laser ? "pointer.status" : "metrics.hand")}
            value={laser ? t(`pointer.${laserState}`) : t(`metrics.${hand}`)}
            hint={laser ? t(result?.laser ? "pointer.noteFound" : "pointer.noteMissing") : hand === "handFound" ? t("metrics.handNoteFound") : t("metrics.handNoteMissing")}
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
            tone="amber"
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

      <div className={styles.monitor}>
        <CameraPanel visible={visible} />
        <div className={styles.side}>
          <SelectionCard />
          <TargetsCard />
        </div>
      </div>

      <RecentSelections />
    </div>
  );
};
