import { Button, Divider, Drawer, Select, Switch, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CLASS_GROUPS } from "@/common/constants";
import { BUILTIN_KEYS } from "@/models3d";
import { SelectionStreamService } from "@/Services/SelectionStreamService";
import { getCustomModels } from "@/store/library";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getPreview, viewerActions } from "@/store/viewer";
import { objectLabel } from "@/utils/format";
import styles from "./viewer.module.less";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Cài đặt của màn hình 3D (lưu trên trình duyệt này): test kết nối backend, hiển thị, xem thử mô hình */
export const SettingsDrawer = ({ open, onClose }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const preview = useAppSelector(getPreview);
  const customCount = Object.keys(useAppSelector(getCustomModels)).length;
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  // Ping trên chính WebSocket đang nghe; chi tiết (trang, máy gửi) chỉ ghi ở log backend
  const testConnection = async () => {
    setTesting(true);
    try {
      await SelectionStreamService.ping();
      setTestOk(true);
    } catch {
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  };

  // Lớp COCO theo nhóm như trang camera; lớp có mô hình mà không thuộc nhóm nào vào "Khác"
  const previewOptions = useMemo(() => {
    const grouped = new Set(CLASS_GROUPS.flatMap((g) => g.classes));
    const groups = [
      ...CLASS_GROUPS,
      { key: "other", classes: BUILTIN_KEYS.filter((key) => !grouped.has(key)) },
    ].filter((g) => g.classes.length);
    return groups.map((g) => ({
      label: t(`classGroups.${g.key}`),
      title: g.key,
      options: g.classes.map((name) => ({ value: name, label: objectLabel(t, name) })),
    }));
  }, [t]);

  return (
    <Drawer title={t("settings.title")} open={open} onClose={onClose} width="min(420px, 100vw)">
      <Typography.Title level={5}>{t("settings.connection")}</Typography.Title>
      <Button type="primary" loading={testing} onClick={testConnection}>
        {t("settings.test")}
      </Button>
      {testOk !== null && (
        <Typography.Paragraph type={testOk ? "success" : "danger"} className={styles.fieldHelp} role="status">
          {t(testOk ? "settings.testOk" : "settings.testFail")}
        </Typography.Paragraph>
      )}

      <Divider />
      <Typography.Title level={5}>{t("settings.display")}</Typography.Title>
      <div className={styles.switchRow}>
        <span>{t("settings.autoRotate")}</span>
        <Switch
          aria-label={t("settings.autoRotate")}
          checked={prefs.autoRotate}
          onChange={(autoRotate) => dispatch(settingActions.updatePreferences({ autoRotate }))}
        />
      </div>
      <div className={styles.switchRow}>
        <span>{t("settings.keepLast")}</span>
        <Switch
          aria-label={t("settings.keepLast")}
          checked={prefs.keepLast}
          onChange={(keepLast) => dispatch(settingActions.updatePreferences({ keepLast }))}
        />
      </div>
      <Typography.Paragraph type="secondary" className={styles.fieldHelp}>
        {t("settings.keepLastHelp")}
      </Typography.Paragraph>

      <label className={styles.fieldLabel} htmlFor="preview-object">
        {t("settings.preview")}
      </label>
      <Select
        id="preview-object"
        className={styles.fullWidth}
        showSearch
        allowClear
        value={preview?.name}
        placeholder={t("settings.previewPlaceholder")}
        options={previewOptions}
        optionFilterProp="label"
        onChange={(value?: string) => dispatch(viewerActions.setPreview(value ?? null))}
      />
      <Typography.Paragraph type="secondary" className={styles.fieldHelp}>
        {t("settings.previewHelp")}
      </Typography.Paragraph>

      <Divider />
      <Typography.Paragraph className={styles.fieldHelp}>
        {t("settings.customModels", { count: customCount })}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" className={styles.fieldHelp}>
        {t("settings.customHelp")}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" className={styles.fieldHelp}>
        {t("settings.shortcuts")}
      </Typography.Paragraph>
      <Button onClick={() => dispatch(settingActions.resetPreferences())}>{t("settings.reset")}</Button>
    </Drawer>
  );
};
