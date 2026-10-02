import { Input, Modal } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { StreamLink } from "@/common/types";
import { parseStreamUrl } from "@/utils/stream";
import styles from "./streamDialog.module.less";

interface Props {
  /** Camera đang sửa (Cài đặt) hoặc luồng điền sẵn; không có = thêm mới */
  initial?: StreamLink | null;
  onCancel: () => void;
  onSave: (link: StreamLink) => void;
}

/** Thêm / sửa một camera RTSP: tên tự đặt + địa chỉ (dán cả lệnh "ffplay rtsp://…" cũng được) */
export const StreamDialog = ({ initial, onCancel, onSave }: Props) => {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [value, setValue] = useState(initial?.url ?? "");
  const url = parseStreamUrl(value);
  const save = () => url && onSave({ url, ...(name.trim() ? { name: name.trim() } : {}) });
  return (
    <Modal
      open
      title={t(initial?.url ? "camera.rtsp.editTitle" : "camera.rtsp.title")}
      okText={t("camera.rtsp.save")}
      cancelText={t("camera.rtsp.cancel")}
      okButtonProps={{ disabled: !url }}
      onOk={save}
      onCancel={onCancel}
      destroyOnHidden
    >
      <p className={styles.help}>{t("camera.rtsp.help")}</p>
      <label className={styles.field}>
        <span>{t("camera.rtsp.name")}</span>
        <Input value={name} maxLength={60} placeholder={t("camera.rtsp.namePlaceholder")}
          onChange={(event) => setName(event.target.value)} onPressEnter={save} />
      </label>
      <label className={styles.field}>
        <span>{t("camera.rtsp.url")}</span>
        <Input
          autoFocus
          aria-label={t("camera.rtsp.url")}
          value={value}
          placeholder="rtsp://192.168.1.10:8554/camera"
          status={value.trim() && !url ? "error" : undefined}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={save}
        />
      </label>
      {value.trim() && !url && <p className={styles.error}>{t("camera.rtsp.invalid")}</p>}
      {url && url !== value.trim() && <p className={styles.help}>{t("camera.rtsp.parsed", { url })}</p>}
    </Modal>
  );
};
