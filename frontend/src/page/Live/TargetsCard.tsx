import { Card } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ROUTES } from "@/common/constants";
import { ObjectIcon } from "@/components";
import { useAppSelector } from "@/store/hooks";
import { getActiveTargets } from "@/store/setting";
import { getFrameResult } from "@/store/vision";
import { objectLabel } from "@/utils/format";
import styles from "./live.module.less";

/** Các loại vật thể đang nhận diện và số lượng thấy trong khung hiện tại */
export const TargetsCard = () => {
  const { t } = useTranslation();
  const targets = useAppSelector(getActiveTargets);
  const result = useAppSelector(getFrameResult);
  const counts = useMemo(() => {
    const byName: Record<string, number> = {};
    for (const detection of result?.detections ?? []) byName[detection.name] = (byName[detection.name] ?? 0) + 1;
    return byName;
  }, [result]);

  return (
    <Card
      size="small"
      className={styles.targetsCard}
      title={t("targets.title")}
      extra={<span className={styles.countBadge}>{String(targets.length).padStart(2, "0")}</span>}
    >
      <div className={styles.targetList}>
        {targets.map((name) => {
          const count = counts[name] ?? 0;
          return (
            <div key={name} className={`${styles.targetRow} ${count ? styles.detected : ""}`}>
              <ObjectIcon name={name} size={17} />
              <span>{objectLabel(t, name)}</span>
              <span className={styles.targetCount}>{count ? t("targets.count", { count }) : "—"}</span>
            </div>
          );
        })}
      </div>
      <Link to={ROUTES.settings} className={styles.editLink}>
        {t("targets.edit")}
      </Link>
    </Card>
  );
};
