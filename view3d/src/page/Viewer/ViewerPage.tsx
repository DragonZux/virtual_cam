import { Button, Tooltip } from "antd";
import { Box, Maximize, Minimize, Rotate3d, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useFullscreen, useShortcuts } from "@/hooks";
import { resolveModelKey } from "@/models3d";
import { Stage } from "@/scene/Stage";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getCustomModels, libraryActions } from "@/store/library";
import { getPreferences, settingActions } from "@/store/setting";
import { getDisplayed, streamActions } from "@/store/stream";
import { viewerActions } from "@/store/viewer";
import { classKey, objectLabel } from "@/utils/format";
import { ConnectionHelp, ConnectionPill, SessionSelect } from "./ConnectionBar";
import { ObjectPanel, type ModelSource } from "./ObjectPanel";
import { RecentStrip } from "./RecentStrip";
import { SettingsDrawer } from "./SettingsDrawer";
import styles from "./viewer.module.less";

/**
 * Màn hình 3D: nghe WebSocket `/api/vision/ws` của Virtual Cam, vật thể nào được xác nhận trên trang camera
 * thì hiện mô hình 3D của vật đó. Chỉ đọc kết quả, không mở camera, không gửi gì lên máy chủ.
 */
export const ViewerPage = () => {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const displayed = useAppSelector(getDisplayed);
  const prefs = useAppSelector(getPreferences);
  const customModels = useAppSelector(getCustomModels);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { active: fullscreen, toggle: toggleFullscreen } = useFullscreen();

  useEffect(() => {
    dispatch(streamActions.start());
    dispatch(libraryActions.loadRequest());
    return () => {
      dispatch(streamActions.stop());
    };
  }, [dispatch]);

  const name = displayed?.name ?? null;
  const modelKey = name ? resolveModelKey(name) : null;
  const custom = name ? (customModels[classKey(name)] ?? (modelKey ? customModels[modelKey] : undefined)) : undefined;
  // File GLB riêng hỏng: cảnh đã tự dùng mô hình dựng sẵn, thẻ thông tin báo rõ
  const [brokenGlb, setBrokenGlb] = useState<string | null>(null);
  const modelSource: ModelSource | null = !name
    ? null
    : custom
      ? custom.url === brokenGlb
        ? "customFailed"
        : "custom"
      : modelKey
        ? "builtin"
        : "generic";

  // Vòng sáng trên bệ mỗi lần camera xác nhận vật thể (kể cả chọn lại đúng vật vừa bỏ chọn)
  const liveKey = displayed?.kind === "live" ? `${displayed.selection?.session_id}|${displayed.name}` : null;
  const [pulse, setPulse] = useState({ key: null as string | null, count: 0 });
  if (liveKey !== pulse.key) setPulse({ key: liveKey, count: liveKey ? pulse.count + 1 : pulse.count });

  useEffect(() => {
    document.title = name ? t("app.objectTitle", { name: objectLabel(t, name) }) : t("app.documentTitle");
  }, [name, t]);

  const toggleRotate = () => dispatch(settingActions.updatePreferences({ autoRotate: !prefs.autoRotate }));
  useShortcuts(!settingsOpen, { f: () => void toggleFullscreen(), r: toggleRotate });

  return (
    <div
      className={styles.viewer}
      data-kind={displayed?.kind ?? "none"}
      data-model={modelSource === "custom" ? "custom" : (modelKey ?? (name ? "generic" : "none"))}
    >
      <Stage
        className={styles.canvas}
        name={name}
        custom={custom}
        autoRotate={prefs.autoRotate}
        pulse={pulse.count}
        onCustomError={setBrokenGlb}
      />

      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Box size={24} strokeWidth={1.6} />
          </span>
          <span className={styles.brandText}>
            virtual<span>cam</span>
            <small>{t("app.tagline")}</small>
          </span>
        </div>
        <div className={styles.actions}>
          <ConnectionPill />
          <SessionSelect />
          <Tooltip title={t(prefs.autoRotate ? "toolbar.rotateOn" : "toolbar.rotateOff")}>
            <Button
              shape="circle"
              type={prefs.autoRotate ? "primary" : "default"}
              icon={<Rotate3d size={17} />}
              aria-label={t(prefs.autoRotate ? "toolbar.rotateOn" : "toolbar.rotateOff")}
              aria-pressed={prefs.autoRotate}
              onClick={toggleRotate}
            />
          </Tooltip>
          <Tooltip title={t(fullscreen ? "toolbar.exitFullscreen" : "toolbar.fullscreen")}>
            <Button
              shape="circle"
              icon={fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
              aria-label={t(fullscreen ? "toolbar.exitFullscreen" : "toolbar.fullscreen")}
              onClick={() => void toggleFullscreen()}
            />
          </Tooltip>
          <Tooltip title={t("toolbar.settings")}>
            <Button
              shape="circle"
              icon={<Settings size={17} />}
              aria-label={t("toolbar.settings")}
              onClick={() => setSettingsOpen(true)}
            />
          </Tooltip>
          <Button
            className={styles.langButton}
            onClick={() => i18n.changeLanguage(i18n.language?.startsWith("en") ? "vi" : "en")}
            aria-label={t("toolbar.switchLanguageLabel")}
          >
            {t("toolbar.switchLanguage")}
          </Button>
        </div>
      </header>

      <div className={styles.alerts}>
        <ConnectionHelp onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      <ObjectPanel
        displayed={displayed}
        modelSource={modelSource}
        onBackToLive={() => dispatch(viewerActions.setPreview(null))}
      />
      <footer className={styles.footer}>
        <RecentStrip current={name} />
        <span className={styles.hint}>{t("hint.drag")}</span>
      </footer>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};
