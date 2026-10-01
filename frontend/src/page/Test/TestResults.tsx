import { Button, Card, Empty, Select, Slider, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { CONFIDENCE_RANGE } from "@/common/constants";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getActiveTargets, getPreferences, settingActions } from "@/store/setting";
import { getFrameResult, getVisionStatus } from "@/store/vision";
import { formatPercent, objectLabel } from "@/utils/format";
import styles from "./test.module.less";

export const TestResults = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const result = useAppSelector(getFrameResult);
  const status = useAppSelector(getVisionStatus);
  const prefs = useAppSelector(getPreferences);
  const targets = useAppSelector(getActiveTargets);
  const confidence = prefs.confidence ?? status?.defaults.confidence ?? 0.8;
  return <Card size="small" title={t("test.results")}>
    <div className={styles.content}>
      <label>{t("settings.detection.confidence")} · {formatPercent(confidence)}
        <Slider {...CONFIDENCE_RANGE} value={confidence} onChange={(value) => dispatch(settingActions.updatePreferences({ confidence: value }))} />
      </label>
      <Select mode="multiple" aria-label={t("settings.targets.title")} value={targets} maxTagCount="responsive"
        options={status?.classes.map((name) => ({ value: name, label: objectLabel(t, name) }))}
        onChange={(values: string[]) => { if (values.length) dispatch(settingActions.updatePreferences({ targets: values })); }} />
      <Button size="small" disabled={!status?.classes.length} onClick={() => dispatch(settingActions.updatePreferences({ targets: status?.classes }))}>{t("settings.targets.all")}</Button>
      {result && <p>{t("test.timing", { ms: result.processing_ms, count: result.detections.length })}</p>}
      {result?.laser && <Tag color="orange">{t("test.laserResult", { x: result.laser.point[0], y: result.laser.point[1], score: formatPercent(result.laser.score) })}</Tag>}
      {result?.detections.length ? <div className={styles.detections}>
        {result.detections.map((detection, index) => <div key={index} className={styles.row}>
          <span>{objectLabel(t, detection.name)}</span><strong>{formatPercent(detection.confidence)}</strong>
        </div>)}
      </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(result ? "test.noDetections" : "test.waiting")} />}
    </div>
  </Card>;
};
