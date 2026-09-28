import { Card } from "antd";
import type { ReactNode } from "react";

import styles from "./statCard.module.less";

export type StatTone = "brand" | "blue" | "dark" | "purple";

interface Props {
  title: ReactNode;
  value: ReactNode;
  /** Đơn vị nhỏ cạnh số (FPS…) */
  suffix?: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone: StatTone;
  /** Giá trị dạng chữ (trạng thái) thay vì số */
  textual?: boolean;
}

export const StatCard = ({ title, value, suffix, hint, icon, tone, textual }: Props) => (
  <Card size="small" className={styles.card}>
    <div className={styles.body}>
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        <div className={textual ? `${styles.value} ${styles.textual}` : styles.value}>
          {value}
          {suffix && <small>{suffix}</small>}
        </div>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <span className={`${styles.icon} ${styles[tone]}`}>{icon}</span>
    </div>
  </Card>
);
