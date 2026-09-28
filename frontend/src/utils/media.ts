import { MEDIA_EXTENSIONS } from "@/common/constants";
import type { MediaKind } from "@/common/types";
import { API_BASE_URL } from "@/environment";

/** Thuộc tính accept của ô chọn file */
export const MEDIA_ACCEPT = [...MEDIA_EXTENSIONS.image, ...MEDIA_EXTENSIONS.video].join(",");

const extension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** Loại file theo đuôi (máy chủ cũng chỉ nhận theo đuôi); null = không hỗ trợ */
export const mediaKindOf = (name: string): MediaKind | null => {
  const ext = extension(name);
  if ((MEDIA_EXTENSIONS.image as readonly string[]).includes(ext)) return "image";
  if ((MEDIA_EXTENSIONS.video as readonly string[]).includes(ext)) return "video";
  return null;
};

/** GET /media/{name} — phát lại file đã lưu trên máy chủ */
export const mediaUrl = (name: string) => `${API_BASE_URL}/media/${encodeURIComponent(name)}`;

/** 1536000 → "1.5 MB" */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};
