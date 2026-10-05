import { Button, Card, Popconfirm, Space, Table, Tag } from "antd";
import { Cctv, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/common/constants";
import type { StreamLink } from "@/common/types";
import { StreamDialog } from "@/components/StreamDialog/StreamDialog";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getStreamLinks, streamActions } from "@/store/stream";
import { getCamera } from "@/store/vision";
import { displayStreamUrl } from "@/utils/stream";
import styles from "./settings.module.less";

/** Camera RTSP của trình duyệt này: thêm / sửa / xoá link và kết nối (khung camera ở trang Tổng quan mở luồng) */
export const StreamsCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const links = useAppSelector(getStreamLinks);
  const camera = useAppSelector(getCamera);
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
    <Table<StreamLink> size="small" rowKey="url" pagination={false} dataSource={links} scroll={{ x: 560 }}
      locale={{ emptyText: t("settings.streams.empty") }} columns={[
        { title: t("settings.streams.name"), render: (_, link) => <strong>{link.name || "—"}</strong> },
        { title: t("settings.streams.url"), render: (_, link) => <Space size={8} wrap>
          <span className={styles.modelName}>{displayStreamUrl(link.url)}</span>
          {camera.stream === link.url && camera.status === "on" && <Tag color="success">{t("settings.streams.watching")}</Tag>}
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
