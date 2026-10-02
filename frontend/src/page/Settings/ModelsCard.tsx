import { Alert, Button, Card, Space, Table, Tag, Tooltip, Upload } from "antd";
import { Boxes, RefreshCw, Upload as UploadIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MODEL_KINDS } from "@/common/constants";
import type { ModelInfo, ModelKind } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getConvertingSources, getCurrentModels, modelActions } from "@/store/model";
import { getVisionStatus } from "@/store/vision";
import { notify } from "@/utils/notify";
import styles from "./settings.module.less";

/** Đuôi file máy chủ chuyển được sang TensorRT */
const CONVERTIBLE = /\.(pt|torchscript)$/i;

/** Engine TensorRT / đang chuyển / thiếu file */
const ModelStateTag = ({ model }: { model: ModelInfo }) => {
  const { t } = useTranslation();
  const converting = useAppSelector(getConvertingSources).has(model.id);
  if (!model.available) return <Tag color="error">{t("models.missing")}</Tag>;
  if (model.name.toLowerCase().endsWith(".engine")) return <Tag color="purple">{t("models.engine")}</Tag>;
  if (converting) return <Tag color="processing">{t("models.converting")}</Tag>;
  return null;
};

/** Đang tải lên, lỗi và thông báo xong của thao tác mô hình */
const ModelAlerts = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { busy, error, success } = useAppSelector((state) => state.model);
  return <>
    {busy && <Alert showIcon type="info" message={t(`models.${busy}Busy`)} />}
    {error && <Alert showIcon type="error" message={error} closable onClose={() => dispatch(modelActions.dismiss())}
      action={<Button size="small" onClick={() => { dispatch(modelActions.dismiss()); dispatch(modelActions.listRequest()); }}>{t("models.refresh")}</Button>} />}
    {success && <Alert showIcon type="success" message={t(`models.${success}Success`)} closable onClose={() => dispatch(modelActions.dismiss())} />}
  </>;
};

interface Row {
  kind: ModelKind;
  /** Mô hình đang chạy của loại này (mô hình cũ không hiện) */
  model?: ModelInfo;
}

/** Mỗi loại một dòng: mô hình đang chạy + nút Cập nhật (tải lên là dùng ngay, có GPU thì tự chuyển TensorRT FP16) */
export const ModelsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { catalog, busy, loading } = useAppSelector((state) => state.model);
  const status = useAppSelector(getVisionStatus);
  const current = useAppSelector(getCurrentModels);
  const [uploading, setUploading] = useState<ModelKind | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const disabled = !!busy || !!status?.model_busy || status?.phase !== "ready";
  const canConvert = !!catalog?.convert_available;
  const shown = (catalog?.conversions ?? []).filter((job) => job.status !== "done" && !dismissed.includes(job.id));
  const rows: Row[] = MODEL_KINDS.map((kind) => ({ kind, model: current[kind] }));
  const upload = (kind: ModelKind, file: File) => {
    if (catalog && file.size > catalog.max_bytes) {
      notify.error(t("models.tooLarge", { size: catalog.max_bytes / 1024 / 1024 }));
      return;
    }
    setUploading(kind);
    dispatch(modelActions.uploadRequest({ kind, file, convert: canConvert && CONVERTIBLE.test(file.name) }));
  };
  return <Card title={<span className={styles.cardTitle}><Boxes size={17} />{t("models.title")}</span>}
    extra={<Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => dispatch(modelActions.listRequest())}>{t("models.refresh")}</Button>}>
    <Table<Row> size="small" rowKey="kind" pagination={false} dataSource={rows} scroll={{ x: 560 }} columns={[
      { title: t("models.kind"), dataIndex: "kind", render: (kind: ModelKind) => <strong>{t(`models.${kind}`)}</strong> },
      { title: t("models.name"), render: (_, { model }) => model
        ? <Space size={8} wrap><span className={styles.modelName}>{model.name}</span><ModelStateTag model={model} /></Space> : "—" },
      { title: t("models.size"), render: (_, { model }) => model ? `${(model.size_bytes / 1024 / 1024).toFixed(1)} MB` : "—" },
      { title: t("models.update"), render: (_, { kind }) => (
        <Upload accept=".pt,.torchscript,.engine" showUploadList={false} disabled={disabled}
          beforeUpload={(file) => {
            upload(kind, file);
            return Upload.LIST_IGNORE;
          }}>
          <Tooltip title={t(canConvert ? "models.updateHelp" : "models.updateHelpNoConvert")}>
            <Button size="small" icon={<UploadIcon size={13} />} disabled={disabled}
              loading={busy === "upload" && uploading === kind} aria-label={`${t("models.update")} ${t(`models.${kind}`)}`}>
              {t("models.update")}
            </Button>
          </Tooltip>
        </Upload>
      ) },
    ]} />
    <div className={styles.modelAlerts}><ModelAlerts /></div>
    {shown.length > 0 && <Space direction="vertical" className={styles.conversions}>
      {shown.map((job) => job.status === "error"
        ? <Alert key={job.id} showIcon type="error" closable onClose={() => setDismissed((ids) => [...ids, job.id])}
          message={t("models.convertFailed", { name: job.name, error: job.error ?? "" })} />
        : <Alert key={job.id} showIcon type="info"
          message={t(job.status === "queued" ? "models.convertQueued" : "models.convertRunning", { name: job.name })} />)}
    </Space>}
  </Card>;
};
