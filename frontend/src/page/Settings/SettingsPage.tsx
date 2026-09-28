import { Button, Card, Popconfirm, Segmented, Slider, Switch, Typography } from "antd";
import { Eye, SlidersHorizontal, Smartphone, Volume2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { CONFIDENCE_RANGE, DWELL_RANGE, TOLERANCE_RANGE, LASER_BRIGHTNESS_RANGE, DEFAULT_PREFERENCES } from "@/common/constants";
import { PointerControls } from "@/components/PointerControls/PointerControls";
import type { MirrorMode, Preferences } from "@/common/types";
import { useVoiceAvailable } from "@/hooks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getShareUrls, getVisionStatus, visionActions } from "@/store/vision";
import { formatPercent } from "@/utils/format";
import { notify } from "@/utils/notify";
import { speak, speechLang, speechSupported } from "@/utils/speech";
import { TargetPicker } from "./TargetPicker";
import styles from "./settings.module.less";

interface FieldProps {
  label: string;
  value: string;
  help: string;
  extra?: string | false;
  children: ReactNode;
}

const RangeField = ({ label, value, help, extra, children }: FieldProps) => (
  <div className={styles.field}>
    <div className={styles.fieldHead}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
    {children}
    <div className={styles.help}>
      {help}
      {extra && <span className={styles.serverDefault}>{extra}</span>}
    </div>
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
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const status = useAppSelector(getVisionStatus);
  const shareUrls = useAppSelector(getShareUrls);
  const voiceLang = speechLang(i18n.language ?? "vi");
  const voiceAvailable = useVoiceAvailable(voiceLang);
  const defaults = status?.defaults;
  const confidence = prefs.confidence ?? defaults?.confidence ?? 0.2;
  const tolerance = prefs.tolerance ?? defaults?.tolerance ?? 30;

  const update = (patch: Partial<Preferences>) => {
    if (patch.laserBrightness !== undefined && patch.laserBrightness !== prefs.laserBrightness) {
      dispatch(visionActions.cancelFrames());
    }
    dispatch(settingActions.updatePreferences(patch));
  };
  const reset = () => {
    if (prefs.pointerMode !== DEFAULT_PREFERENCES.pointerMode ||
        prefs.laserColor !== DEFAULT_PREFERENCES.laserColor ||
        prefs.laserBrightness !== DEFAULT_PREFERENCES.laserBrightness) {
      dispatch(visionActions.cancelFrames());
    }
    dispatch(settingActions.resetPreferences());
    notify.success(t("settings.resetDone"));
  };
  const [primaryUrl, ...otherUrls] = shareUrls;

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <TargetPicker />

        <div className={styles.column}>
          <Card title={<CardTitle icon={<SlidersHorizontal size={17} />}>{t("settings.detection.title")}</CardTitle>}>
            <PointerControls />
            {prefs.pointerMode === "laser" && (
              <RangeField label={t("pointer.brightness")} value={String(prefs.laserBrightness)} help={t("pointer.brightnessHelp")}>
                <Slider {...LASER_BRIGHTNESS_RANGE} value={prefs.laserBrightness}
                  onChange={(laserBrightness: number) => update({ laserBrightness })} />
              </RangeField>
            )}
            <RangeField
              label={t("settings.detection.confidence")}
              value={formatPercent(confidence)}
              help={t("settings.detection.confidenceHelp")}
              extra={!!defaults && t("settings.serverDefault", { value: formatPercent(defaults.confidence) })}
            >
              <Slider
                {...CONFIDENCE_RANGE}
                value={confidence}
                tooltip={{ formatter: (v) => formatPercent(v ?? 0) }}
                onChange={(value: number) => update({ confidence: value })}
              />
            </RangeField>
            {prefs.pointerMode === "hand" && <RangeField
              label={t("settings.detection.tolerance")}
              value={`${tolerance} px`}
              help={t("settings.detection.toleranceHelp")}
              extra={!!defaults && t("settings.serverDefault", { value: `${defaults.tolerance} px` })}
            >
              <Slider
                {...TOLERANCE_RANGE}
                value={tolerance}
                tooltip={{ formatter: (v) => `${v} px` }}
                onChange={(value: number) => update({ tolerance: value })}
              />
            </RangeField>}
            <RangeField
              label={t("settings.detection.dwell")}
              value={`${prefs.dwellMs} ms`}
              help={t("settings.detection.dwellHelp")}
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
            <SwitchRow label={t("settings.display.hand")} checked={prefs.showHand} onChange={(v) => update({ showHand: v })} />
            <SwitchRow label={t("settings.display.tip")} checked={prefs.showTip} onChange={(v) => update({ showTip: v })} />
            <SwitchRow
              label={t("settings.display.outline")}
              checked={prefs.showOutline}
              onChange={(v) => update({ showOutline: v })}
            />
            <SwitchRow label={t("settings.display.boxes")} checked={prefs.showBoxes} onChange={(v) => update({ showBoxes: v })} />
            <div className={styles.mirror}>
              <span>{t("settings.display.mirror")}</span>
              <Segmented<MirrorMode>
                block
                value={prefs.mirror}
                onChange={(mirror) => update({ mirror })}
                options={[
                  { value: "auto", label: t("settings.display.mirrorAuto") },
                  { value: "on", label: t("settings.display.mirrorOn") },
                  { value: "off", label: t("settings.display.mirrorOff") },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          <Card title={<CardTitle icon={<Volume2 size={17} />}>{t("settings.voice.title")}</CardTitle>}>
            {speechSupported() ? (
              <>
                <SwitchRow label={t("settings.voice.enabled")} checked={prefs.voice} onChange={(v) => update({ voice: v })} />
                <div className={styles.voiceActions}>
                  <Button size="small" icon={<Volume2 size={14} />} onClick={() => speak(t("settings.voice.sample"), voiceLang)}>
                    {t("settings.voice.test")}
                  </Button>
                  {!voiceAvailable && <span className={styles.help}>{t("settings.voice.noVoice")}</span>}
                </div>
              </>
            ) : (
              <span className={styles.help}>{t("settings.voice.unsupported")}</span>
            )}
          </Card>

          <Card title={<CardTitle icon={<Smartphone size={17} />}>{t("settings.share.title")}</CardTitle>}>
            {primaryUrl ? (
              <div className={styles.share}>
                <p>{t("settings.share.intro")}</p>
                <Typography.Text
                  className={styles.shareUrl}
                  copyable={{ text: primaryUrl, tooltips: [t("settings.share.copy"), t("settings.share.copied")] }}
                >
                  {primaryUrl}
                </Typography.Text>
                {otherUrls.length > 0 && (
                  <div className={styles.otherUrls}>
                    {t("settings.share.others")}: {otherUrls.join(" · ")}
                  </div>
                )}
                <p className={styles.help}>{t("settings.share.certNote")}</p>
              </div>
            ) : (
              <p className={styles.help}>{t("settings.share.disabled")}</p>
            )}
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
