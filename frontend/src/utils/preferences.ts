import { CONFIDENCE_RANGE, DEFAULT_PREFERENCES, DWELL_RANGE, TOLERANCE_RANGE, LASER_BRIGHTNESS_RANGE } from "@/common/constants";
import type { MirrorMode, Preferences } from "@/common/types";

const STORAGE_KEY = "virtualcam.preferences";
const MIRROR_MODES: MirrorMode[] = ["auto", "on", "off"];

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
    pointerMode: r.pointerMode === "laser" ? "laser" : "hand",
    laserColor: r.laserColor === "green" ? "green" : "red",
    laserBrightness: numberIn(r.laserBrightness, LASER_BRIGHTNESS_RANGE) ?? d.laserBrightness,
    targets,
    confidence: numberIn(r.confidence, CONFIDENCE_RANGE),
    tolerance: numberIn(r.tolerance, TOLERANCE_RANGE),
    dwellMs: numberIn(r.dwellMs, DWELL_RANGE) ?? d.dwellMs,
    showHand: boolOr(r.showHand, d.showHand),
    showTip: boolOr(r.showTip, d.showTip),
    showOutline: boolOr(r.showOutline, d.showOutline),
    showBoxes: boolOr(r.showBoxes, d.showBoxes),
    mirror: MIRROR_MODES.includes(r.mirror as MirrorMode) ? (r.mirror as MirrorMode) : d.mirror,
    voice: boolOr(r.voice, d.voice),
  };
};

export const loadPreferences = (): Preferences => {
  try {
    return sanitizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
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
