import { MEDIA_EXTENSIONS } from "@/common/constants";
import type { MediaKind } from "@/common/types";

/** Thuộc tính accept của ô chọn file */
export const MEDIA_ACCEPT = [...MEDIA_EXTENSIONS.image, ...MEDIA_EXTENSIONS.video].join(",");

const extension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** Loại file theo đuôi; null = không hỗ trợ */
export const mediaKindOf = (name: string): MediaKind | null => {
  const ext = extension(name);
  if ((MEDIA_EXTENSIONS.image as readonly string[]).includes(ext)) return "image";
  if ((MEDIA_EXTENSIONS.video as readonly string[]).includes(ext)) return "video";
  return null;
};
