import { Alert, Button, Select } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ROUTES } from "@/common/constants";
import type { ModelKind } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { modelActions } from "@/store/model";
import { getVisionStatus } from "@/store/vision";
import styles from "./modelControls.module.less";

export const ModelControls = ({ managementLink = true }: { managementLink?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { catalog, loading, busy, error, success } = useAppSelector((state) => state.model);
  const status = useAppSelector(getVisionStatus);
  return <div className={styles.root}>
    <div className={styles.selectors}>
      {(["segmentation", "laser"] as ModelKind[]).map((kind) => {
        const items = catalog?.items.filter((model) => model.kind === kind) ?? [];
        return <div className={styles.field} key={kind}>
          <span>{t(`models.${kind}`)}</span>
          <Select
            aria-label={t(`models.${kind}`)}
            value={items.find((model) => model.active)?.id}
            placeholder={t("models.select")}
            loading={loading || !!busy || status?.model_busy}
            disabled={!!busy || status?.model_busy || status?.phase !== "ready" || !items.length}
            options={items.map((model) => ({ value: model.id, label: model.name, disabled: !model.available }))}
            onChange={(id: string) => dispatch(modelActions.activateRequest(id))}
            popupMatchSelectWidth={false}
          />
        </div>;
      })}
      {managementLink && <Link to={ROUTES.settings} className={styles.manage}>{t("models.manage")}</Link>}
    </div>
    <p className={styles.hint}>{t("models.shared")}</p>
    {busy && <Alert showIcon type="info" message={t(`models.${busy}Busy`)} />}
    {error && <Alert showIcon type="error" message={error} closable onClose={() => dispatch(modelActions.dismiss())}
      action={<Button size="small" onClick={() => { dispatch(modelActions.dismiss()); dispatch(modelActions.listRequest()); }}>{t("models.refresh")}</Button>} />}
    {success && <Alert showIcon type="success" message={t(`models.${success}Success`)} closable onClose={() => dispatch(modelActions.dismiss())} />}
  </div>;
};
