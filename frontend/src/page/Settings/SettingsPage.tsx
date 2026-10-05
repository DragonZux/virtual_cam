import { Button, Card, Popconfirm, Slider, Switch } from "antd";
import { Eye, SlidersHorizontal, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CONFIDENCE_RANGE, DWELL_RANGE } from "@/common/constants";
import type { Preferences } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getVisionStatus } from "@/store/vision";
import { formatPercent } from "@/utils/format";
import { notify } from "@/utils/notify";
import { TargetPicker } from "./TargetPicker";
import { ModelsCard } from "./ModelsCard";
import { SocketCard } from "./SocketCard";
import { StreamsCard } from "./StreamsCard";
import styles from "./settings.module.less";

interface FieldProps {
  label: string;
  value: string;
  extra?: string | false;
  children: ReactNode;
}

const RangeField = ({ label, value, extra, children }: FieldProps) => (
  <div className={styles.field}>
    <div className={styles.fieldHead}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    {children}
    {extra && <div className={styles.serverDefault}>{extra}</div>}
  </div>
);

const SwitchRow = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className={styles.switchRow}>
    <span>{label}</span>
    <Switch size="small" checked={checked} onChange={onChange} />
  </label>
);

const CardTitle = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <span className={styles.cardTitle}>
    {icon}
    {children}
  </span>
);

export const SettingsPage = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const status = useAppSelector(getVisionStatus);
  const defaults = status?.defaults;
  const confidence = prefs.confidence ?? defaults?.confidence ?? 0.2;

  const update = (patch: Partial<Preferences>) => dispatch(settingActions.updatePreferences(patch));
  const reset = () => {
    dispatch(settingActions.resetPreferences());
    notify.success(t("settings.resetDone"));
  };

  return (
    <div className={styles.page}>
      <ModelsCard />
      <StreamsCard />
      <SocketCard />
      <div className={styles.grid}>
        <TargetPicker />

        <div className={styles.column}>
          <Card title={<CardTitle icon={<SlidersHorizontal size={17} />}>{t("settings.detection.title")}</CardTitle>}>
            <RangeField
              label={t("settings.detection.confidence")}
              value={formatPercent(confidence)}
              extra={!!defaults && t("settings.serverDefault", { value: formatPercent(defaults.confidence) })}
            >
              <Slider
                {...CONFIDENCE_RANGE}
                value={confidence}
                tooltip={{ formatter: (v) => formatPercent(v ?? 0) }}
                onChange={(value: number) => update({ confidence: value })}
              />
            </RangeField>
            <RangeField
              label={t("settings.detection.dwell")}
              value={`${prefs.dwellMs} ms`}
            >
              <Slider
                {...DWELL_RANGE}
                value={prefs.dwellMs}
                tooltip={{ formatter: (v) => `${v} ms` }}
                onChange={(value: number) => update({ dwellMs: value })}
              />
            </RangeField>
          </Card>

          <Card title={<CardTitle icon={<Eye size={17} />}>{t("settings.display.title")}</CardTitle>}>
            <SwitchRow
              label={t("settings.display.outline")}
              checked={prefs.showOutline}
              onChange={(v) => update({ showOutline: v })}
            />
            <SwitchRow label={t("settings.display.boxes")} checked={prefs.showBoxes} onChange={(v) => update({ showBoxes: v })} />
            <SwitchRow label={t("settings.display.mirror")} checked={prefs.mirror} onChange={(v) => update({ mirror: v })} />
          </Card>
        </div>
      </div>

      <div className={styles.footer}>
        <span>{t("settings.saved")}</span>
        <Popconfirm title={t("settings.resetConfirm")} onConfirm={reset}>
          <Button icon={<RotateCcw size={15} />}>{t("settings.reset")}</Button>
        </Popconfirm>
      </div>
    </div>
  );
};
