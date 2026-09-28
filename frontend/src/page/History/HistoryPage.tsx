import { Button, Card, Col, Empty, Popconfirm, Row, Space, Table, Tag } from "antd";
import { Clock, Download, Gauge, Hash, Trash2, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAX_HISTORY } from "@/common/constants";
import type { SelectionEvent } from "@/common/types";
import { ObjectIcon, StatCard } from "@/components";
import { useNow } from "@/hooks";
import { getHistoryStats, getSelectionEvents, historyActions } from "@/store/history";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getSessionStartedAt } from "@/store/vision";
import { downloadCsv } from "@/utils/download";
import { fileStamp, formatDateTime, formatDuration, formatPercent, formatTime, objectLabel } from "@/utils/format";
import { notify } from "@/utils/notify";
import styles from "./history.module.less";

export const HistoryPage = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const events = useAppSelector(getSelectionEvents);
  const stats = useAppSelector(getHistoryStats);
  const startedAt = useAppSelector(getSessionStartedAt);
  const now = useNow(1000);

  const exportCsv = () =>
    downloadCsv(
      `${t("history.csv.file")}-${fileStamp()}`,
      [t("history.csv.id"), t("history.csv.object"), t("history.csv.className"), t("history.csv.time"), t("history.csv.confidence")],
      events.map((e) => [e.id, objectLabel(t, e.name), e.name, formatDateTime(e.time), Math.round(e.confidence * 100)]),
    );

  const clear = () => {
    dispatch(historyActions.clearHistory());
    notify.success(t("history.cleared"));
  };

  return (
    <div className={styles.page}>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <StatCard
            title={t("history.total")}
            value={stats.total}
            hint={t("history.totalNote")}
            icon={<Hash size={18} />}
            tone="mint"
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            textual
            title={t("history.top")}
            value={stats.topName ? objectLabel(t, stats.topName) : "—"}
            hint={stats.topName ? t("history.topCount", { count: stats.topCount }) : " "}
            icon={<Trophy size={18} />}
            tone="amber"
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            title={t("history.average")}
            value={stats.averageConfidence === null ? "—" : formatPercent(stats.averageConfidence)}
            hint={t("history.averageNote")}
            icon={<Gauge size={18} />}
            tone="blue"
          />
        </Col>
        <Col xs={12} lg={6}>
          <StatCard
            title={t("history.session")}
            value={startedAt ? formatDuration(now - startedAt) : "—"}
            hint={t("history.sessionNote")}
            icon={<Clock size={18} />}
            tone="purple"
          />
        </Col>
      </Row>

      <Card
        className={styles.tableCard}
        title={
          <span>
            {t("history.tableTitle")}
            <span className={styles.subtle}>{t("history.tableSubtitle", { count: MAX_HISTORY })}</span>
          </span>
        }
        extra={
          <Space size={8} wrap>
            <Button icon={<Download size={15} />} disabled={!events.length} onClick={exportCsv}>
              {t("history.export")}
            </Button>
            <Popconfirm title={t("history.clearConfirm")} onConfirm={clear} disabled={!events.length}>
              <Button danger icon={<Trash2 size={15} />} disabled={!events.length}>
                {t("history.clear")}
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table<SelectionEvent>
          rowKey="id"
          dataSource={events}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: true }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("history.empty")} /> }}
          columns={[
            {
              title: t("history.columns.id"),
              dataIndex: "id",
              width: 90,
              render: (id: number) => <span className={styles.muted}>{String(id).padStart(2, "0")}</span>,
            },
            {
              title: t("history.columns.object"),
              dataIndex: "name",
              render: (name: string) => (
                <span className={styles.object}>
                  <span className={styles.objectIcon}>
                    <ObjectIcon name={name} size={15} />
                  </span>
                  {objectLabel(t, name)}
                </span>
              ),
            },
            {
              title: t("history.columns.time"),
              dataIndex: "time",
              render: (time: number) => formatTime(time),
            },
            {
              title: t("history.columns.confidence"),
              dataIndex: "confidence",
              align: "right",
              render: (value: number) => <Tag color="green">{formatPercent(value)}</Tag>,
            },
          ]}
        />
      </Card>
      <p className={styles.footnote}>{t("history.footnote")}</p>
    </div>
  );
};
