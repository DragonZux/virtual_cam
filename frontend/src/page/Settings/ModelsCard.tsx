import { Alert, Button, Card, Checkbox, Segmented, Space, Table, Tag, Tooltip, Upload } from "antd";
import { Boxes, RefreshCw, Upload as UploadIcon, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo, ModelKind } from "@/common/types";
import { ModelControls } from "@/components/ModelControls/ModelControls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { modelActions } from "@/store/model";
import { getVisionStatus } from "@/store/vision";
import { notify } from "@/utils/notify";
import styles from "./settings.module.less";

/** Đuôi file máy chủ chuyển được sang TensorRT */
const CONVERTIBLE = /\.(pt|torchscript)$/i;

export const ModelsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { catalog, busy, loading } = useAppSelector((state) => state.model);
  const status = useAppSelector(getVisionStatus);
  const [kind, setKind] = useState<ModelKind>("segmentation");
  // null = theo máy chủ: bật khi có GPU NVIDIA + TensorRT
  const [convertChoice, setConvertChoice] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const disabled = !!busy || !!status?.model_busy || status?.phase !== "ready";
  const canConvert = !!catalog?.convert_available;
  const convert = canConvert && (convertChoice ?? true);
  const jobs = catalog?.conversions ?? [];
  const converting = (id: string) => jobs.some((job) => job.source === id && (job.status === "queued" || job.status === "running"));
  const shown = jobs.filter((job) => job.status !== "done" && !dismissed.includes(job.id));
  return <Card title={<span className={styles.cardTitle}><Boxes size={17} />{t("models.title")}</span>}
    extra={<Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => dispatch(modelActions.listRequest())}>{t("models.refresh")}</Button>}>
    <ModelControls managementLink={false} />
    <div className={styles.modelUpload}>
      <Segmented<ModelKind> value={kind} onChange={setKind} options={[
        { value: "segmentation", label: t("models.segmentation") }, { value: "laser", label: t("models.laser") },
      ]} />
      <Upload accept={kind === "segmentation" ? ".pt,.engine" : ".pt,.torchscript,.engine"} showUploadList={false} disabled={disabled}
        beforeUpload={(file) => {
          if (catalog && file.size > catalog.max_bytes) notify.error(t("models.tooLarge", { size: catalog.max_bytes / 1024 / 1024 }));
          else dispatch(modelActions.uploadRequest({ kind, file, convert: convert && CONVERTIBLE.test(file.name) }));
          return Upload.LIST_IGNORE;
        }}>
        <Button type="primary" icon={<UploadIcon size={15} />} disabled={disabled} loading={busy === "upload"}>{t("models.upload")}</Button>
      </Upload>
      <Tooltip title={canConvert ? t("models.convertHelp") : catalog?.convert_reason}>
        <Checkbox checked={convert} disabled={!canConvert} onChange={(event) => setConvertChoice(event.target.checked)}>
          {t("models.convertOnUpload")}
        </Checkbox>
      </Tooltip>
      <span className={styles.help}>{t(kind === "segmentation" ? "models.segmentHelp" : "models.laserHelp")}</span>
    </div>
    {shown.length > 0 && <Space direction="vertical" className={styles.conversions}>
      {shown.map((job) => job.status === "error"
        ? <Alert key={job.id} showIcon type="error" closable onClose={() => setDismissed((ids) => [...ids, job.id])}
          message={t("models.convertFailed", { name: job.name, error: job.error ?? "" })} />
        : <Alert key={job.id} showIcon type="info"
          message={t(job.status === "queued" ? "models.convertQueued" : "models.convertRunning", { name: job.name })} />)}
    </Space>}
    <Table<ModelInfo> size="small" rowKey="id" pagination={false} dataSource={catalog?.items ?? []} scroll={{ x: 680 }}
      locale={{ emptyText: t("models.empty") }} columns={[
        { title: t("models.name"), dataIndex: "name", render: (name: string) => <span className={styles.modelName}>{name}</span> },
        { title: t("models.kind"), dataIndex: "kind", render: (value: ModelKind) => t(`models.${value}`) },
        { title: t("models.size"), dataIndex: "size_bytes", render: (size: number) => `${(size / 1024 / 1024).toFixed(1)} MB` },
        { title: t("models.state"), render: (_, model) => !model.available ? <Tag color="error">{t("models.missing")}</Tag>
          : model.active ? <Tag color="success">{t("models.active")}</Tag>
            : <Button size="small" disabled={disabled} onClick={() => dispatch(modelActions.activateRequest(model.id))}>{t("models.activate")}</Button> },
        { title: "TensorRT", render: (_, model) => model.name.toLowerCase().endsWith(".engine") ? <Tag color="purple">{t("models.engine")}</Tag>
          : model.convertible && <Tooltip title={canConvert ? t("models.convertHelp") : catalog?.convert_reason}>
            <Button size="small" icon={<Zap size={13} />} disabled={!canConvert || !!busy || converting(model.id)}
              loading={converting(model.id)} onClick={() => dispatch(modelActions.convertRequest(model.id))}>
              {t(converting(model.id) ? "models.converting" : "models.convert")}
            </Button>
          </Tooltip> },
      ]} />
    <p className={styles.help}>{t("models.storage")}</p>
  </Card>;
};
