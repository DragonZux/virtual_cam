import { Button, Card, Popconfirm, Space, Table, Tag } from "antd";
import { Cctv, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { firstValueFrom } from "rxjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/common/constants";
import type { StreamLink } from "@/common/types";
import { StreamDialog } from "@/components/StreamDialog/StreamDialog";
import { CameraService } from "@/Services/CameraService";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getStreamLinks, streamActions } from "@/store/stream";
import { getCamera, isPaused, visionActions } from "@/store/vision";
import { displayStreamUrl, streamName } from "@/utils/stream";
import styles from "./settings.module.less";

/**
 * Camera RTSP của trình duyệt này: thêm / sửa / xoá link và kết nối (máy chủ chạy camera đó thay camera đang chạy).
 * Dòng đầu cho biết máy chủ đang nhận diện camera nào — có thể do trang khác chọn, kể cả camera không có trong danh sách.
 */
export const StreamsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const links = useAppSelector(getStreamLinks);
  const camera = useAppSelector(getCamera);
  const paused = useAppSelector(isPaused);
  const server = camera.server;
  const running = links.find((link) => server && displayStreamUrl(link.url) === server.url);
  const runningLabel = server ? streamName(running ?? { url: server.url, name: server.name ?? undefined }) : null;
  const badge = camera.status === "on" ? (paused ? "paused" : "active") : "connecting";
  const stop = () => {
    dispatch(visionActions.cameraStopped());
    void firstValueFrom(CameraService.stop()).catch(() => undefined);
  };
  // undefined = đóng hộp thoại, null = thêm mới
  const [editing, setEditing] = useState<StreamLink | null | undefined>(undefined);
  const connect = (url: string) => {
    dispatch(streamActions.requestConnect(url));
    navigate(ROUTES.live);
  };
  return <Card
    title={<span className={styles.cardTitle}><Cctv size={17} />{t("settings.streams.title")}</span>}
    extra={<Button size="small" type="primary" icon={<Plus size={14} />} onClick={() => setEditing(null)}>{t("settings.streams.add")}</Button>}
  >
    <div className={styles.runningCamera} role="status">
      {server
        ? <>
          <span>{t("settings.streams.running")}</span>
          <strong>{runningLabel}</strong>
          {runningLabel !== server.url && <span className={styles.modelName}>{server.url}</span>}
          <Tag color={badge === "active" ? "success" : badge === "paused" ? "warning" : "processing"}>{t(`settings.streams.${badge}`)}</Tag>
          <Button size="small" icon={<Power size={13} />} onClick={stop}>{t("settings.streams.stop")}</Button>
        </>
        : <span>{t("settings.streams.idle")}</span>}
    </div>
    <Table<StreamLink> size="small" rowKey="url" pagination={false} dataSource={links} scroll={{ x: 560 }}
      locale={{ emptyText: t("settings.streams.empty") }} columns={[
        { title: t("settings.streams.name"), render: (_, link) => <strong>{link.name || "—"}</strong> },
        { title: t("settings.streams.url"), render: (_, link) => <Space size={8} wrap>
          <span className={styles.modelName}>{displayStreamUrl(link.url)}</span>
          {link === running && <Tag color={badge === "active" ? "success" : badge === "paused" ? "warning" : "processing"}>
            {t(`settings.streams.${badge}`)}
          </Tag>}
        </Space> },
        { title: "", align: "right", render: (_, link) => <Space size={6} wrap>
          <Button size="small" icon={<Cctv size={13} />} onClick={() => connect(link.url)}>{t("settings.streams.connect")}</Button>
          <Button size="small" icon={<Pencil size={13} />} aria-label={t("settings.streams.edit")} onClick={() => setEditing(link)} />
          <Popconfirm title={t("settings.streams.removeConfirm")} onConfirm={() => dispatch(streamActions.removeLink(link.url))}>
            <Button size="small" danger icon={<Trash2 size={13} />} aria-label={t("settings.streams.remove")} />
          </Popconfirm>
        </Space> },
      ]} />
    {editing !== undefined && <StreamDialog initial={editing} onCancel={() => setEditing(undefined)} onSave={(link) => {
      dispatch(streamActions.saveLink({ link, previous: editing?.url }));
      setEditing(undefined);
    }} />}
  </Card>;
};
