import { Card, Spin, Upload } from "antd";
import { Film, FolderOpen, Image as ImageIcon, Upload as UploadIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { MediaItem } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getMediaFolder, getMediaItems, getMediaMaxBytes, getMediaUploading, mediaActions } from "@/store/media";
import { getCamera, getConnection } from "@/store/vision";
import { formatDateTime } from "@/utils/format";
import { MEDIA_ACCEPT, formatBytes } from "@/utils/media";
import styles from "./live.module.less";

interface Props {
  /** File vừa chọn: phát ngay trong khung camera và lưu vào thư mục của máy chủ */
  onOpenFile: (file: File) => void;
  /** File đã lưu trước đó: phát lại từ máy chủ */
  onOpenSaved: (item: MediaItem) => void;
}

/** Tải ảnh / video lên để thử nhận diện thay cho camera; file lưu trong thư mục của máy chủ để thử lại */
export const MediaCard = ({ onOpenFile, onOpenSaved }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const items = useAppSelector(getMediaItems);
  const folder = useAppSelector(getMediaFolder);
  const maxBytes = useAppSelector(getMediaMaxBytes);
  const uploading = useAppSelector(getMediaUploading);
  const connection = useAppSelector(getConnection);
  const camera = useAppSelector(getCamera);
  const playing = camera.status === "on" && camera.source === "media" ? camera.media?.name : null;

  // Máy chủ có thể chưa chạy lúc mở trang: hỏi lại mỗi khi kết nối được
  useEffect(() => {
    if (connection === "online") dispatch(mediaActions.fetchListRequest());
  }, [connection, dispatch]);

  return (
    <Card
      size="small"
      title={t("media.title")}
      extra={<span className={styles.countBadge}>{String(items.length).padStart(2, "0")}</span>}
    >
      <Upload.Dragger
        accept={MEDIA_ACCEPT}
        multiple={false}
        showUploadList={false}
        className={styles.mediaDrop}
        beforeUpload={(file) => {
          onOpenFile(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <UploadIcon size={20} className={styles.mediaDropIcon} />
        <p className={styles.mediaDropText}>{t("media.drop")}</p>
        <p className={styles.mediaDropHint}>{t("media.formats", { mb: Math.round((maxBytes ?? 0) / 1024 / 1024) || 500 })}</p>
      </Upload.Dragger>

      <div className={styles.mediaFolder} title={folder ?? undefined}>
        <FolderOpen size={13} />
        <span>
          {t("media.savedTo")}: <code>{folder ?? t("media.folderUnknown")}</code>
        </span>
      </div>

      {uploading && (
        <div className={styles.mediaSaving}>
          <Spin size="small" />
          <span>{t("media.saving", { name: uploading })}</span>
        </div>
      )}

      <div className={styles.mediaList}>
        {items.length === 0 ? (
          <p className={styles.mediaEmpty}>{t("media.empty")}</p>
        ) : (
          items.map((item) => {
            const active = item.name === playing;
            return (
              <button
                key={item.name}
                type="button"
                className={`${styles.mediaRow} ${active ? styles.mediaActive : ""}`}
                aria-label={t("media.play", { name: item.name })}
                aria-pressed={active}
                onClick={() => onOpenSaved(item)}
              >
                <span className={styles.mediaIcon}>{item.kind === "video" ? <Film size={15} /> : <ImageIcon size={15} />}</span>
                <span className={styles.mediaText}>
                  <span className={styles.mediaName} title={item.name}>
                    {item.name}
                  </span>
                  <span className={styles.mediaMeta}>
                    {active ? t("media.playing") : t(`media.${item.kind}`)} · {formatBytes(item.size)} · {formatDateTime(item.modified)}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );
};
