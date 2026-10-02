import { CONFIDENCE_RANGE, DEFAULT_PREFERENCES, DWELL_RANGE } from "@/common/constants";
import type { Preferences } from "@/common/types";

const STORAGE_KEY = "hicascam.preferences";
/** Khoá trước khi đổi tên dự án: vẫn đọc để không mất cài đặt cũ */
const LEGACY_KEY = "virtualcam.preferences";

type Range = { min: number; max: number };

const numberIn = (value: unknown, range: Range): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : undefined;

const boolOr = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

/** Dữ liệu localStorage có thể cũ / bị sửa tay → chỉ nhận trường đúng kiểu, còn lại về mặc định */
export const sanitizePreferences = (raw: unknown): Preferences => {
  const d = DEFAULT_PREFERENCES;
  if (!raw || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  const targets =
    Array.isArray(r.targets) && r.targets.length && r.targets.every((t) => typeof t === "string")
      ? (r.targets as string[])
      : undefined;
  return {
    targets,
    confidence: numberIn(r.confidence, CONFIDENCE_RANGE),
    dwellMs: numberIn(r.dwellMs, DWELL_RANGE) ?? d.dwellMs,
    showOutline: boolOr(r.showOutline, d.showOutline),
    showBoxes: boolOr(r.showBoxes, d.showBoxes),
    // Bản cũ lưu "auto" | "on" | "off": chỉ "on" là lật
    mirror: typeof r.mirror === "boolean" ? r.mirror : r.mirror === "on",
  };
};

export const loadPreferences = (): Preferences => {
  try {
    return sanitizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const savePreferences = (prefs: Preferences): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Trình duyệt chặn lưu trữ (chế độ riêng tư…): cài đặt vẫn dùng được trong phiên, chỉ không nhớ lại
  }
};
