import { Tooltip } from "antd";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getRecent, streamActions } from "@/store/stream";
import { viewerActions } from "@/store/viewer";
import { classKey, formatPercent, formatTime, objectLabel } from "@/utils/format";
import styles from "./viewer.module.less";

/** Vật thể vừa được chọn (mới nhất trước); bấm để xem lại mô hình */
export const RecentStrip = ({ current }: { current: string | null }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const recent = useAppSelector(getRecent);
  if (!recent.length) return null;

  return (
    <nav className={styles.recent} aria-label={t("recent.title")}>
      <span className={styles.recentTitle}>{t("recent.title")}</span>
      {recent.map((item) => (
        <Tooltip key={item.id} title={`${formatTime(item.timestamp)} · ${formatPercent(item.confidence)}`}>
          <button
            type="button"
            className={`${styles.chip} ${current && classKey(current) === classKey(item.name) ? styles.chipActive : ""}`}
            onClick={() => dispatch(viewerActions.setPreview(item.name))}
          >
            {objectLabel(t, item.name)}
          </button>
        </Tooltip>
      ))}
      <Tooltip title={t("recent.clear")}>
        <button
          type="button"
          className={styles.chipClear}
          aria-label={t("recent.clear")}
          onClick={() => dispatch(streamActions.clearRecent())}
        >
          <X size={14} />
        </button>
      </Tooltip>
    </nav>
  );
};
