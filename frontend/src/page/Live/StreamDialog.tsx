import { Input, Modal } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { parseStreamUrl } from "@/utils/stream";
import styles from "./live.module.less";

const STORAGE_KEY = "virtualcam.rtspUrl";

const loadUrl = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

const saveUrl = (url: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // Trình duyệt chặn lưu trữ: lần sau nhập lại
  }
};

interface Props {
  open: boolean;
  /** Địa chỉ vừa dùng (lỗi kết nối → mở lại để sửa) */
  initial?: string | null;
  onCancel: () => void;
  onConnect: (url: string) => void;
}

export const StreamDialog = ({ open, initial, onCancel, onConnect }: Props) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => initial ?? loadUrl());
  const url = parseStreamUrl(value);
  const connect = () => {
    if (!url) return;
    saveUrl(url);
    onConnect(url);
  };
  return (
    <Modal
      open={open}
      title={t("camera.rtsp.title")}
      okText={t("camera.rtsp.connect")}
      cancelText={t("camera.rtsp.cancel")}
      okButtonProps={{ disabled: !url }}
      onOk={connect}
      onCancel={onCancel}
      destroyOnHidden
    >
      <p className={styles.streamHelp}>{t("camera.rtsp.help")}</p>
      <Input
        autoFocus
        aria-label={t("camera.rtsp.title")}
        value={value}
        placeholder="rtsp://192.168.1.10:8554/camera"
        status={value.trim() && !url ? "error" : undefined}
        onChange={(event) => setValue(event.target.value)}
        onPressEnter={connect}
      />
      {value.trim() && !url && <p className={styles.streamError}>{t("camera.rtsp.invalid")}</p>}
      {url && url !== value.trim() && <p className={styles.streamHelp}>{t("camera.rtsp.parsed", { url })}</p>}
    </Modal>
  );
};
