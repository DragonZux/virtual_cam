import { Segmented, Select, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { LaserColor, PointerMode } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getVisionStatus, visionActions } from "@/store/vision";
import styles from "./pointerControls.module.less";

export const PointerControls = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const status = useAppSelector(getVisionStatus);
  const update = (patch: { pointerMode?: PointerMode; laserColor?: LaserColor }) => {
    dispatch(visionActions.cancelFrames());
    dispatch(settingActions.updatePreferences(patch));
  };
  return (
    <div className={styles.controls}>
      <span>{t("pointer.mode")}</span>
      <Segmented<PointerMode>
        aria-label={t("pointer.mode")}
        value={prefs.pointerMode}
        onChange={(pointerMode) => update({ pointerMode })}
        options={[
          { value: "hand", label: t("pointer.hand") },
          { value: "laser", label: t("pointer.laser") },
        ]}
      />
      {prefs.pointerMode === "laser" && (
        <Select<LaserColor>
          className={styles.color}
          aria-label={t("pointer.color")}
          value={prefs.laserColor}
          onChange={(laserColor) => update({ laserColor })}
          options={[
            { value: "red", label: t("pointer.red") },
            { value: "green", label: t("pointer.green") },
          ]}
        />
      )}
      {prefs.pointerMode === "laser" && (
        <Typography.Text className={styles.note} type={prefs.laserColor === "red" && status?.laser_error ? "danger" : "secondary"}>
          {prefs.laserColor === "green" ? t("pointer.greenMethod")
            : status?.laser_error ? t("pointer.modelUnavailable")
              : status?.laser_model ? t("pointer.redModelReady") : t("pointer.redModelLoading")}
        </Typography.Text>
      )}
    </div>
  );
};
