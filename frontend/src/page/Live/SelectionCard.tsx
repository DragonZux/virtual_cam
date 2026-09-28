import { Card, Progress } from "antd";
import { Target } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ObjectIcon } from "@/components";
import { useAppSelector } from "@/store/hooks";
import { getPreferences } from "@/store/setting";
import { getTracking } from "@/store/vision";
import { objectLabel } from "@/utils/format";
import styles from "./live.module.less";

/** Vật thể đã xác nhận (held) hoặc đang giữ ngón tay chờ xác nhận (pending) */
export const SelectionCard = () => {
  const { t } = useTranslation();
  const { held, pending } = useAppSelector(getTracking);
  const laser = useAppSelector(getPreferences).pointerMode === "laser";
  const name = held?.name ?? pending?.name ?? null;
  const confidence = held ? Math.round(held.confidence * 100) : 0;

  return (
    <Card
      size="small"
      className={`${styles.selectionCard} ${held ? styles.hasSelection : ""}`}
      title={t("selection.title")}
      extra={<span className={styles.tinyLabel}>{t("selection.current")}</span>}
    >
      <div className={styles.selectionBody}>
        <div className={styles.selectedIcon}>
          {name ? <ObjectIcon name={name} size={30} strokeWidth={1.4} /> : <Target size={30} strokeWidth={1.4} />}
        </div>
        <span className={styles.kicker}>
          {held ? t(laser ? "pointer.selected" : "selection.selected") : pending ? t(laser ? "pointer.confirming" : "selection.confirming") : t("selection.ready")}
        </span>
        <h3 aria-live="polite">{name ? objectLabel(t, name) : t("selection.none")}</h3>
        <p>{laser ? t(held ? "pointer.selectedHint" : "pointer.hint") : t(held ? "selection.selectedHint" : "selection.hint")}</p>
        <div className={styles.confidenceRow}>
          <span>{t("selection.confidence")}</span>
          <strong>{held ? `${confidence}%` : "—"}</strong>
        </div>
        <Progress percent={confidence} showInfo={false} size="small" strokeColor="#3ba78a" />
      </div>
    </Card>
  );
};
