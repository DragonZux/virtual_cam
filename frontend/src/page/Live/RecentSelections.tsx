import { Card } from "antd";
import { ArrowRight, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ROUTES } from "@/common/constants";
import { ObjectIcon } from "@/components";
import { getRecentSelections } from "@/store/history";
import { useAppSelector } from "@/store/hooks";
import { formatPercent, formatTime, objectLabel } from "@/utils/format";
import styles from "./live.module.less";

export const RecentSelections = () => {
  const { t } = useTranslation();
  const events = useAppSelector(getRecentSelections);

  return (
    <Card
      size="small"
      title={
        <>
          {t("recent.title")}
          <span className={styles.softLabel}>{t("recent.subtitle")}</span>
        </>
      }
      extra={
        <Link to={ROUTES.history} className={styles.textLink}>
          {t("recent.viewAll")}
          <ArrowRight size={14} />
        </Link>
      }
    >
      {events.length ? (
        events.map((event) => (
          <div key={event.id} className={styles.recentEvent}>
            <div className={styles.eventIcon}>
              <ObjectIcon name={event.name} size={16} />
            </div>
            <div className={styles.eventText}>
              <div className={styles.eventName}>{objectLabel(t, event.name)}</div>
              <div className={styles.eventSub}>{t(event.pointerMode === "laser" ? "recent.byLaser" : "recent.byFinger")}</div>
            </div>
            <span className={styles.eventTime}>{formatTime(event.time)}</span>
            <span className={styles.eventConfidence}>{formatPercent(event.confidence)}</span>
          </div>
        ))
      ) : (
        <div className={styles.empty}>
          <Clock size={18} />
          <span>{t("recent.empty")}</span>
        </div>
      )}
    </Card>
  );
};
