import { DEFAULT_PREFERENCES } from "@/common/constants";
import type { ViewerPreferences } from "@/common/types";

const STORAGE_KEY = "hicas3d.preferences";
/** Khoá trước khi đổi tên dự án: vẫn đọc để không mất cài đặt cũ */
const LEGACY_KEY = "virtualcam.view3d.preferences";

const boolOr = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

/** Dữ liệu localStorage có thể cũ / bị sửa tay → chỉ nhận trường đúng kiểu, còn lại về mặc định */
export const sanitizePreferences = (raw: unknown): ViewerPreferences => {
  const d = DEFAULT_PREFERENCES;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    wsUrl: typeof r.wsUrl === "string" ? r.wsUrl.trim().slice(0, 500) : d.wsUrl,
    autoRotate: boolOr(r.autoRotate, d.autoRotate),
    keepLast: boolOr(r.keepLast, d.keepLast),
  };
};

export const loadPreferences = (): ViewerPreferences => {
  try {
    return sanitizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const savePreferences = (prefs: ViewerPreferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Trình duyệt chặn lưu trữ (chế độ riêng tư…): cài đặt vẫn dùng được trong phiên, chỉ không nhớ lại
  }
};

/** Tham số trên địa chỉ trang: ?ws=<máy chủ> (không lưu) và ?preview=<tên lớp> (mở sẵn một mô hình) */
export const readPageParams = (search: string = window.location.search) => {
  const params = new URLSearchParams(search);
  const ws = params.get("ws")?.trim();
  const preview = params.get("preview")?.trim();
  return { ws: ws || null, preview: preview || null };
};
