import { Button, Card, Segmented, Table, Tag, Upload } from "antd";
import { Boxes, RefreshCw, Upload as UploadIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelInfo, ModelKind } from "@/common/types";
import { ModelControls } from "@/components/ModelControls/ModelControls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { modelActions } from "@/store/model";
import { getVisionStatus } from "@/store/vision";
import { notify } from "@/utils/notify";
import styles from "./settings.module.less";

export const ModelsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { catalog, busy, loading } = useAppSelector((state) => state.model);
  const status = useAppSelector(getVisionStatus);
  const [kind, setKind] = useState<ModelKind>("segmentation");
  const disabled = !!busy || !!status?.model_busy || status?.phase !== "ready";
  return <Card title={<span className={styles.cardTitle}><Boxes size={17} />{t("models.title")}</span>}
    extra={<Button size="small" icon={<RefreshCw size={14} />} loading={loading} onClick={() => dispatch(modelActions.listRequest())}>{t("models.refresh")}</Button>}>
    <ModelControls managementLink={false} />
    <div className={styles.modelUpload}>
      <Segmented<ModelKind> value={kind} onChange={setKind} options={[
        { value: "segmentation", label: t("models.segmentation") }, { value: "laser", label: t("models.laser") },
      ]} />
      <Upload accept={kind === "segmentation" ? ".pt" : ".pt,.torchscript"} showUploadList={false} disabled={disabled}
        beforeUpload={(file) => {
          if (catalog && file.size > catalog.max_bytes) notify.error(t("models.tooLarge", { size: catalog.max_bytes / 1024 / 1024 }));
          else dispatch(modelActions.uploadRequest({ kind, file }));
          return Upload.LIST_IGNORE;
        }}>
        <Button type="primary" icon={<UploadIcon size={15} />} disabled={disabled} loading={busy === "upload"}>{t("models.upload")}</Button>
      </Upload>
      <span className={styles.help}>{t(kind === "segmentation" ? "models.segmentHelp" : "models.laserHelp")}</span>
    </div>
    <Table<ModelInfo> size="small" rowKey="id" pagination={false} dataSource={catalog?.items ?? []} scroll={{ x: 580 }}
      locale={{ emptyText: t("models.empty") }} columns={[
        { title: t("models.name"), dataIndex: "name", render: (name: string) => <span className={styles.modelName}>{name}</span> },
        { title: t("models.kind"), dataIndex: "kind", render: (value: ModelKind) => t(`models.${value}`) },
        { title: t("models.size"), dataIndex: "size_bytes", render: (size: number) => `${(size / 1024 / 1024).toFixed(1)} MB` },
        { title: t("models.state"), render: (_, model) => !model.available ? <Tag color="error">{t("models.missing")}</Tag>
          : model.active ? <Tag color="success">{t("models.active")}</Tag>
            : <Button size="small" disabled={disabled} onClick={() => dispatch(modelActions.activateRequest(model.id))}>{t("models.activate")}</Button> },
      ]} />
    <p className={styles.help}>{t("models.storage")}</p>
  </Card>;
};
