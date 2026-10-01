import dayjs from "dayjs";
import type { TFunction } from "i18next";

export const formatTime = (ms: number): string => dayjs(ms).format("HH:mm:ss");

export const formatDateTime = (ms: number): string => dayjs(ms).format("DD/MM/YYYY HH:mm:ss");

/** 0.873 → "87%" */
export const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

/** 83000 → "01:23"; có giờ thì "1:02:03" */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours ? `${hours}:${rest}` : rest;
};

/** Hậu tố tên file tải về: 20260925-114012 */
export const fileStamp = (ms: number = Date.now()): string => dayjs(ms).format("YYYYMMDD-HHmmss");

/** Khoá so tên lớp giữa các mô hình, như class_key của backend: " Cell  Phone" → "cell phone" */
export const classKey = (name: string): string => name.trim().split(/\s+/).join(" ").toLowerCase();

/** Tên lớp đã dịch ("Laptop" của mô hình khác vẫn dịch như "laptop"); chưa có bản dịch thì giữ nguyên tên */
export const objectLabel = (t: TFunction, name: string): string =>
  t(`classes.${classKey(name)}`, { defaultValue: name });
