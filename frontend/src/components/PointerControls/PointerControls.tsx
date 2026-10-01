import { Segmented, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { PointerMode } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getVisionStatus, visionActions } from "@/store/vision";
import styles from "./pointerControls.module.less";

export const PointerControls = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const status = useAppSelector(getVisionStatus);
  const update = (patch: { pointerMode?: PointerMode }) => {
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
        <Typography.Text className={styles.note} type={status?.laser_error ? "danger" : "secondary"}>
          {status?.laser_error ? t("pointer.modelUnavailable")
            : status?.laser_model ? t("pointer.redModelReady") : t("pointer.redModelLoading")}
        </Typography.Text>
      )}
    </div>
  );
};
