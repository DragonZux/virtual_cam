import { Segmented, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { LaserColor, PointerMode } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { visionActions } from "@/store/vision";
import styles from "./pointerControls.module.less";

export const PointerControls = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
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
    </div>
  );
};
