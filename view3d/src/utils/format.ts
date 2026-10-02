import type { TFunction } from "i18next";

import { CLASS_ALIASES } from "@/common/constants";

/** Khoá so tên lớp, như class_key của backend: " Cell  Phone" → "cell phone" */
export const classKey = (name: string): string => name.trim().split(/\s+/).join(" ").toLowerCase();

/**
 * Lớp COCO tương ứng với tên nhận được: "Cell_Phone" → "cell phone", "sofa" → "couch" (tên của bộ dữ liệu khác);
 * tên lạ giữ nguyên dạng khoá.
 */
export const canonicalClass = (name: string): string => {
  const key = classKey(name.replace(/[_-]+/g, " "));
  return CLASS_ALIASES[key] ?? CLASS_ALIASES[key.replace(/\s+/g, "")] ?? key;
};

/** Tên lớp đã dịch ("Laptop", "sofa"… của mô hình khác vẫn dịch như lớp COCO); chưa có bản dịch thì giữ nguyên tên */
export const objectLabel = (t: TFunction, name: string): string =>
  t(`classes.${classKey(name)}`, { defaultValue: t(`classes.${canonicalClass(name)}`, { defaultValue: name }) });

/** 0.873 → "87%" */
export const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

const pad = (n: number) => String(n).padStart(2, "0");

/** Unix ms → "14:02:31" (giờ máy đang xem) */
export const formatTime = (ms: number): string => {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** session_id dạng UUID → 6 ký tự đầu để phân biệt các phiên camera */
export const shortId = (id: string): string => id.replace(/-/g, "").slice(0, 6);
