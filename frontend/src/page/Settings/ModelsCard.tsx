import { Button, Card, Popconfirm, Spin, Switch, Tag, Tooltip, Upload } from "antd";
import { Boxes, FolderOpen, Trash2, Upload as UploadIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { ModelInfo } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getModelState, getModels, modelActions } from "@/store/model";
import { getConnection } from "@/store/vision";
import { objectLabel } from "@/utils/format";
import { formatBytes } from "@/utils/media";
import { notify } from "@/utils/notify";
import styles from "./settings.module.less";

const MODEL_ACCEPT = ".pt";

/**
 * Mô hình nhận diện: mô hình mặc định + file .pt tải thêm. Mọi mô hình đang bật cùng chạy trên mỗi khung;
 * danh sách vật thể ở thẻ bên cạnh là hợp các lớp của chúng và tự cập nhật sau mỗi thay đổi.
 */
export const ModelsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const models = useAppSelector(getModels);
  const { canManage, folder, maxBytes, uploading, busy } = useAppSelector(getModelState);
  const connection = useAppSelector(getConnection);
  const enabledCount = models.filter((model) => model.enabled).length;

  useEffect(() => {
    if (connection === "online") dispatch(modelActions.fetchListRequest());
  }, [connection, dispatch]);

  const pick = (file: File) => {
    if (!file.name.toLowerCase().endsWith(MODEL_ACCEPT)) notify.error(t("settings.models.onlyPt"));
    else if (maxBytes !== null && file.size > maxBytes) notify.error(t("settings.models.tooLarge", { mb: Math.round(maxBytes / 1024 / 1024) }));
    else dispatch(modelActions.uploadRequest(file));
    return Upload.LIST_IGNORE;
  };

  const classList = (model: ModelInfo) => model.classes.map((name) => objectLabel(t, name)).join(", ");

  return (
    <Card
      title={
        <span className={styles.cardTitle}>
          <Boxes size={17} />
          {t("settings.models.title")}
        </span>
      }
      extra={<span className={styles.summary}>{t("settings.models.summary", { on: enabledCount, total: models.length })}</span>}
    >
      <div className={styles.modelList}>
        {models.map((model) => {
          const pending = busy.includes(model.id);
          const lastOn = model.enabled && enabledCount === 1;
          return (
            <div key={model.id} className={`${styles.modelRow} ${model.enabled ? "" : styles.modelOff}`}>
              <div className={styles.modelText}>
                <div className={styles.modelName} title={model.id}>
                  {model.id}
                </div>
                <div className={styles.modelMeta}>
                  {model.builtin && <Tag color="orange">{t("settings.models.builtin")}</Tag>}
                  <Tag>{t(`settings.models.task.${model.task}`)}</Tag>
                  <Tooltip title={classList(model)}>
                    <span className={styles.modelClasses}>{t("settings.models.classes", { count: model.classes.length })}</span>
                  </Tooltip>
                  {model.size > 0 && <span>· {formatBytes(model.size)}</span>}
                </div>
                {model.error && <div className={styles.modelError}>{model.error}</div>}
              </div>
              <Tooltip title={lastOn ? t("settings.models.lastOn") : undefined}>
                <Switch
                  size="small"
                  aria-label={t("settings.models.toggle", { name: model.id })}
                  checked={model.enabled}
                  loading={pending}
                  disabled={!canManage || pending || lastOn}
                  onChange={(enabled) => dispatch(modelActions.setEnabledRequest({ id: model.id, enabled }))}
                />
              </Tooltip>
              {!model.builtin && canManage && (
                <Popconfirm
                  title={t("settings.models.removeConfirm", { name: model.id })}
                  okButtonProps={{ danger: true }}
                  disabled={pending || lastOn}
                  onConfirm={() => dispatch(modelActions.removeRequest(model.id))}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    aria-label={t("settings.models.remove", { name: model.id })}
                    icon={<Trash2 size={14} />}
                    disabled={pending || lastOn}
                  />
                </Popconfirm>
              )}
            </div>
          );
        })}
      </div>

      {canManage ? (
        <Upload.Dragger accept={MODEL_ACCEPT} multiple={false} showUploadList={false} beforeUpload={pick} disabled={!!uploading}
          className={styles.modelDrop}>
          {uploading ? (
            <div className={styles.modelUploading}>
              <Spin size="small" />
              <span>{t("settings.models.loading", { name: uploading })}</span>
            </div>
          ) : (
            <>
              <UploadIcon size={18} className={styles.modelDropIcon} />
              <p className={styles.modelDropText}>{t("settings.models.drop")}</p>
              <p className={styles.help}>{t("settings.models.dropHint", { mb: Math.round((maxBytes ?? 0) / 1024 / 1024) })}</p>
            </>
          )}
        </Upload.Dragger>
      ) : (
        <p className={styles.help}>{t("settings.models.localOnly")}</p>
      )}

      <p className={styles.help}>{t("settings.models.note")}</p>
      {folder && (
        <div className={styles.modelFolder} title={folder}>
          <FolderOpen size={13} />
          <span>
            {t("media.savedTo")}: <code>{folder}</code>
          </span>
        </div>
      )}
    </Card>
  );
};
