import type { StreamLink } from "@/common/types";

/** Danh sách camera RTSP của trình duyệt này (Cài đặt › Camera RTSP), theo thứ tự người dùng thêm */
const STORAGE_KEY = "hicascam.rtspStreams";
/** Bản trước chỉ nhớ địa chỉ (mới nhất trước): vẫn đọc để không mất luồng đã lưu */
const LEGACY_LIST_KEYS = ["hicascam.rtspUrls", "virtualcam.rtspUrls"];
const LEGACY_KEY = "virtualcam.rtspUrl";
export const MAX_STREAMS = 20;

/** Nhận cả lệnh dán từ terminal ("ffplay rtsp://…"): lấy địa chỉ rtsp:// / rtsps:// đầu tiên */
export const parseStreamUrl = (text: string): string | null => text.match(/rtsps?:\/\/[^\s"'<>]+/i)?.[0] ?? null;

/** Không hiện tài khoản / mật khẩu camera trên khung hình */
export const displayStreamUrl = (url: string): string => url.replace(/^(rtsps?:\/\/)[^/@]*@/i, "$1");

/** Tên hiển thị của camera: tên đặt trong Cài đặt, không có thì địa chỉ (đã ẩn mật khẩu) */
export const streamName = (link: StreamLink): string => link.name?.trim() || displayStreamUrl(link.url);

const toLinks = (raw: unknown): StreamLink[] => {
  if (!Array.isArray(raw)) return [];
  const links = raw.flatMap((item): StreamLink[] => {
    const url = typeof item === "string" ? item : (item as { url?: unknown })?.url;
    if (typeof url !== "string" || !parseStreamUrl(url)) return [];
    const name = typeof item === "object" && typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : undefined;
    return [{ url, ...(name ? { name } : {}) }];
  });
  return links.filter((link, index) => links.findIndex((other) => other.url === link.url) === index).slice(0, MAX_STREAMS);
};

export const loadStreamLinks = (): StreamLink[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return toLinks(JSON.parse(saved));
    for (const key of LEGACY_LIST_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy !== null) return toLinks(JSON.parse(legacy));
    }
    const single = localStorage.getItem(LEGACY_KEY);
    return single && parseStreamUrl(single) ? [{ url: single }] : [];
  } catch {
    return [];
  }
};

export const saveStreamLinks = (links: StreamLink[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // Trình duyệt chặn lưu trữ: danh sách chỉ dùng được trong phiên
  }
};
