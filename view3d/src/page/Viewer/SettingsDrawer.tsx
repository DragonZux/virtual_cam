import { Alert, Button, Divider, Drawer, Input, Select, Space, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CLASS_GROUPS } from "@/common/constants";
import { BUILTIN_KEYS } from "@/models3d";
import { getCustomModels } from "@/store/library";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPreferences, settingActions } from "@/store/setting";
import { getWsUrl } from "@/store/stream";
import { getPreview, getWsOverride, viewerActions } from "@/store/viewer";
import { objectLabel } from "@/utils/format";
import { resolveWsUrl, sameOriginWsUrl } from "@/utils/wsUrl";
import styles from "./viewer.module.less";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Cài đặt của màn hình 3D (lưu trên trình duyệt này): địa chỉ WebSocket, hiển thị, xem thử mô hình */
export const SettingsDrawer = ({ open, onClose }: Props) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(getPreferences);
  const wsOverride = useAppSelector(getWsOverride);
  const currentUrl = useAppSelector(getWsUrl);
  const preview = useAppSelector(getPreview);
  const customCount = Object.keys(useAppSelector(getCustomModels)).length;
  const [draft, setDraft] = useState(prefs.wsUrl);

  // Mở lại ngăn cài đặt thì ô nhập lấy lại địa chỉ đã lưu
  useEffect(() => {
    if (open) setDraft(prefs.wsUrl);
  }, [open, prefs.wsUrl]);

  const draftInvalid = draft.trim() !== "" && resolveWsUrl(draft, window.location) === null;
  const apply = () => {
    if (!draftInvalid) dispatch(settingActions.updatePreferences({ wsUrl: draft.trim() }));
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
      {wsOverride && (
        <Alert
          className={styles.drawerAlert}
          type="info"
          showIcon
          message={t("settings.wsOverride", { url: wsOverride })}
          action={
            <Button size="small" onClick={() => dispatch(viewerActions.clearWsOverride())}>
              {t("settings.useSettings")}
            </Button>
          }
        />
      )}
      <label className={styles.fieldLabel} htmlFor="ws-url">
        {t("settings.ws")}
      </label>
      <Space.Compact block>
        <Input
          id="ws-url"
          value={draft}
          status={draftInvalid ? "error" : undefined}
          placeholder={t("settings.wsPlaceholder", { url: sameOriginWsUrl(window.location) })}
          allowClear
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={apply}
        />
        <Button type="primary" onClick={apply} disabled={draftInvalid || draft.trim() === prefs.wsUrl}>
          {t("settings.apply")}
        </Button>
      </Space.Compact>
      <Typography.Paragraph type={draftInvalid ? "danger" : "secondary"} className={styles.fieldHelp}>
        {draftInvalid ? t("settings.wsInvalid") : t("settings.wsHelp")}
      </Typography.Paragraph>
      <Typography.Paragraph className={styles.fieldHelp} copyable={currentUrl ? { text: currentUrl } : false}>
        {t("settings.wsCurrent", { url: currentUrl ?? "—" })}
      </Typography.Paragraph>

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
