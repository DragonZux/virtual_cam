import { Card, Typography } from "antd";
import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";

import { API_BASE_URL } from "@/environment";
import styles from "./settings.module.less";

/** WebSocket có sẵn cho app khác kết nối vào nhận vật thể đang chọn */
const websocketUrl = () => {
  const url = new URL(`${API_BASE_URL.replace(/\/$/, "")}/vision/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

export const SocketCard = () => {
  const { t } = useTranslation();
  return <Card title={<span className={styles.cardTitle}><Radio size={17} />{t("settings.socket.title")}</span>}>
    <h3 className={styles.socketTitle}>{t("settings.socket.wsTitle")}</h3>
    <Typography.Text code copyable className={styles.socketUrl}>{websocketUrl()}</Typography.Text>
  </Card>;
};
