import { Button, Card, Typography } from "antd";
import { Radio } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LiveService } from "@/Services/LiveService";
import styles from "./settings.module.less";

/** Test WebSocket trang đang dùng tới backend: chi tiết (trang, máy gửi) chỉ ghi ở log backend */
export const SocketCard = () => {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);
  const test = async () => {
    setTesting(true);
    try {
      await LiveService.ping();
      setOk(true);
    } catch {
      setOk(false);
    } finally {
      setTesting(false);
    }
  };
  return <Card title={<span className={styles.cardTitle}><Radio size={17} />{t("settings.socket.title")}</span>}>
    <Button type="primary" loading={testing} onClick={test}>{t("settings.socket.test")}</Button>
    {ok !== null && <Typography.Paragraph type={ok ? "success" : "danger"} className={styles.socketResult} role="status">
      {t(ok ? "settings.socket.testOk" : "settings.socket.testFail")}
    </Typography.Paragraph>}
  </Card>;
};
