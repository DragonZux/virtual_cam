import { Alert, Button, Select, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getSessions, getStream } from "@/store/stream";
import { getFollow, viewerActions } from "@/store/viewer";
import { objectLabel, shortId } from "@/utils/format";
import { AUTO_FOLLOW } from "@/utils/sessions";
import { certificatePageOf } from "@/utils/wsUrl";
import styles from "./viewer.module.less";

/** Trạng thái WebSocket: chấm màu + chữ; di chuột xem địa chỉ đang nối */
export const ConnectionPill = () => {
  const { t } = useTranslation();
  const { status, url, retryInMs } = useAppSelector(getStream);
  const text = !url
    ? t("connection.invalid")
    : status === "closed"
      ? t("connection.closed", { seconds: Math.max(1, Math.round(retryInMs / 1000)) })
      : t(`connection.${status}`);
  const tone = status === "open" ? styles.live : status === "closed" ? styles.error : styles.neutral;

  return (
    <Tooltip title={url ? t("connection.url", { url }) : undefined}>
      <span className={`${styles.pill} ${tone}`} role="status" data-status={url ? status : "invalid"}>
        <span className={styles.dot} />
        <span className={styles.pillText}>{text}</span>
      </span>
    </Tooltip>
  );
};

/** Nhiều trình duyệt camera cùng phát: chọn phiên để theo dõi (mặc định phiên có lựa chọn mới nhất) */
export const SessionSelect = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(getSessions);
  const follow = useAppSelector(getFollow);
  if (sessions.length < 2 && follow === AUTO_FOLLOW) return null;

  return (
    <Select
      size="middle"
      className={styles.sessionSelect}
      value={follow}
      aria-label={t("sessions.label")}
      onChange={(value: string) => dispatch(viewerActions.setFollow(value))}
      popupMatchSelectWidth={false}
      options={[
        { value: AUTO_FOLLOW, label: t("sessions.auto") },
        ...sessions.map((s) => ({
          value: s.session_id,
          label: `${t("sessions.item", {
            source: t(`object.source.${s.source}`),
            pointer: t(`object.pointer.${s.pointer_mode}`),
            id: shortId(s.session_id),
          })} — ${s.selected ? objectLabel(t, s.selected.name) : t("sessions.idle")}`,
        })),
      ]}
    />
  );
};

/** Chưa nối được lần nào tới wss:// → thường do chứng chỉ tự ký chưa được chấp nhận trên trình duyệt này */
export const ConnectionHelp = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const { t } = useTranslation();
  const { status, url, everOpened } = useAppSelector(getStream);
  if (!url) {
    return (
      <Alert
        className={styles.alert}
        type="error"
        showIcon
        message={t("connection.invalid")}
        action={
          <Button size="small" onClick={onOpenSettings}>
            {t("toolbar.settings")}
          </Button>
        }
      />
    );
  }
  const certPage = certificatePageOf(url);
  // Trang mở bằng HTTPS cùng máy chủ thì chứng chỉ đã được chấp nhận rồi
  if (status !== "closed" || everOpened || !certPage || certPage === `${window.location.origin}/`) return null;
  return (
    <Alert
      className={styles.alert}
      type="warning"
      showIcon
      message={t("connection.certHint", { url: certPage })}
      action={
        <Button size="small" href={certPage} target="_blank" rel="noreferrer">
          {t("connection.openCert")}
        </Button>
      }
    />
  );
};
