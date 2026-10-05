import { Alert, Button, Card, Input, InputNumber, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { Plus, Radio, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TcpTarget, TcpTargetState } from "@/common/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getSocketState, socketActions } from "@/store/socket";
import styles from "./settings.module.less";

/** Hỏi lại trạng thái kết nối của các máy đích TCP trong lúc mở Cài đặt */
const POLL_MS = 3000;
const MAX_TARGETS = 8;
/** IP hoặc tên máy, không kèm giao thức (khớp kiểm tra của backend) */
const HOST_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/;

const STATUS_COLOR: Record<TcpTargetState["status"], string> = {
  connected: "success", connecting: "processing", error: "error", off: "default",
};

/** WebSocket có sẵn cho app khác kết nối vào + máy đích TCP máy chủ tự gửi vật thể đang chọn tới (lưu trên máy chủ) */
export const SocketCard = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { config, saving, error } = useAppSelector(getSocketState);
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | null>(null);

  useEffect(() => {
    dispatch(socketActions.loadRequest());
    const timer = window.setInterval(() => dispatch(socketActions.loadRequest()), POLL_MS);
    return () => window.clearInterval(timer);
  }, [dispatch]);

  const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${config?.websocket_path ?? "/api/vision/ws"}`;
  const targets = config?.tcp ?? [];
  const save = (next: TcpTarget[]) => dispatch(socketActions.saveRequest(next));
  const plain = (target: TcpTargetState): TcpTarget => ({ host: target.host, port: target.port, enabled: target.enabled });
  const trimmed = host.trim();
  const duplicate = targets.some((target) => target.host === trimmed && target.port === port);
  const addProblem = !trimmed || !port ? null
    : !HOST_PATTERN.test(trimmed) || trimmed.includes("://") ? t("settings.socket.invalidHost")
      : duplicate ? t("settings.socket.duplicate")
        : targets.length >= MAX_TARGETS ? t("settings.socket.max") : null;
  const add = () => {
    if (!trimmed || !port || addProblem) return;
    save([...targets.map(plain), { host: trimmed, port, enabled: true }]);
    setHost("");
    setPort(null);
  };

  return <Card title={<span className={styles.cardTitle}><Radio size={17} />{t("settings.socket.title")}</span>}>
    <section className={styles.socketSection}>
      <h3>{t("settings.socket.wsTitle")}</h3>
      <Typography.Text code copyable className={styles.socketUrl}>{wsUrl}</Typography.Text>
    </section>

    <section className={styles.socketSection}>
      <h3>{t("settings.socket.tcpTitle")}</h3>
      <Table<TcpTargetState> size="small" rowKey="id" pagination={false} dataSource={targets} scroll={{ x: 520 }}
        locale={{ emptyText: t("settings.socket.empty") }} columns={[
          { title: t("settings.socket.address"), render: (_, target) => <strong className={styles.modelName}>{target.id}</strong> },
          { title: t("settings.socket.status"), render: (_, target) => <Tooltip title={target.error}>
            <Tag color={STATUS_COLOR[target.status]}>
              {t(`settings.socket.${target.status}`, { count: target.sent })}
            </Tag>
          </Tooltip> },
          { title: t("settings.socket.enabled"), render: (_, target) => <Switch size="small" checked={target.enabled} disabled={saving}
            aria-label={`${t("settings.socket.enabled")} ${target.id}`}
            onChange={(enabled) => save(targets.map((item) => item.id === target.id ? { ...plain(item), enabled } : plain(item)))} /> },
          { title: "", align: "right", render: (_, target) => <Button size="small" danger icon={<Trash2 size={13} />} disabled={saving}
            aria-label={`${t("settings.socket.remove")} ${target.id}`}
            onClick={() => save(targets.filter((item) => item.id !== target.id).map(plain))} /> },
        ]} />
      <div className={styles.addRow}>
        <Input value={host} placeholder="192.168.1.20" aria-label={t("settings.socket.host")} className={styles.hostInput}
          status={addProblem ? "error" : undefined} onChange={(event) => setHost(event.target.value)} onPressEnter={add} />
        <InputNumber value={port} min={1} max={65535} precision={0} placeholder="5000" aria-label={t("settings.socket.port")}
          className={styles.portInput} onChange={(value) => setPort(value)} onPressEnter={add} />
        <Button icon={<Plus size={14} />} disabled={!trimmed || !port || !!addProblem} loading={saving} onClick={add}>
          {t("settings.socket.add")}
        </Button>
      </div>
      {addProblem && <p className={styles.fieldError}>{addProblem}</p>}
      {error && <Alert showIcon type="error" message={error} closable onClose={() => dispatch(socketActions.dismiss())} />}
    </section>
  </Card>;
};
