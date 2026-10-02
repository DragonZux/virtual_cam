import { Button, Progress } from "antd";
import { Crosshair, Hand, Image as ImageIcon, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DisplayedObject } from "@/common/types";
import { BRAND } from "@/theme/antdTheme";
import { formatPercent, formatTime, objectLabel } from "@/utils/format";
import styles from "./viewer.module.less";

export type ModelSource = "custom" | "customFailed" | "builtin" | "generic";

interface Props {
  displayed: DisplayedObject | null;
  modelSource: ModelSource | null;
  onBackToLive: () => void;
}

/** Thẻ thông tin vật thể đang hiện: tên (đã dịch + tên lớp gốc), độ tin cậy, cách chỉ, nguồn hình */
export const ObjectPanel = ({ displayed, modelSource, onBackToLive }: Props) => {
  const { t } = useTranslation();
  const selection = displayed?.selection ?? null;
  const kind = displayed?.kind ?? "none";
  const note =
    kind === "none"
      ? t("object.noneHint")
      : kind === "last"
        ? t("object.lastHint")
        : kind === "preview"
          ? t("object.previewHint")
          : null;

  return (
    <section className={`${styles.panel} ${styles[`panel_${kind}`] ?? ""}`} aria-live="polite">
      <span className={styles.kicker}>{t(`object.kicker.${kind}`)}</span>
      <h1 className={styles.objectName}>{displayed ? objectLabel(t, displayed.name) : t("object.none")}</h1>
      {/* Tên lớp gốc của mô hình nhận diện (khi đã có bản dịch khác tên gốc) */}
      {displayed && objectLabel(t, displayed.name) !== displayed.name && (
        <code className={styles.className}>{displayed.name}</code>
      )}

      {selection && (
        <div className={styles.details}>
          <div className={styles.confidenceRow}>
            <span>{t("object.confidence")}</span>
            <strong>{formatPercent(selection.confidence)}</strong>
          </div>
          <Progress
            percent={Math.round(selection.confidence * 100)}
            showInfo={false}
            size="small"
            strokeColor={BRAND.primary}
          />
          <div className={styles.tags}>
            <span className={styles.tag}>
              {selection.pointer_mode === "laser" ? <Crosshair size={13} /> : <Hand size={13} />}
              {t(`object.pointer.${selection.pointer_mode}`)}
            </span>
            <span className={styles.tag}>
              {selection.source === "media" ? <ImageIcon size={13} /> : <Video size={13} />}
              {t(`object.source.${selection.source}`)}
            </span>
            <span className={styles.time}>{t("object.at", { time: formatTime(selection.timestamp) })}</span>
          </div>
        </div>
      )}

      {note && <p className={styles.note}>{note}</p>}
      {displayed && modelSource && <div className={styles.modelSource}>{t(`object.model.${modelSource}`)}</div>}
      {kind === "preview" && (
        <Button type="primary" size="small" className={styles.backButton} onClick={onBackToLive}>
          {t("object.backToLive")}
        </Button>
      )}
    </section>
  );
};
