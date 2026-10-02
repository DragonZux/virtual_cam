import type { CustomModel, ModelManifest } from "@/common/types";
import { classKey } from "./format";

const isAngles = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v));

/**
 * public/models/manifest.json → khoá lớp → file GLB (URL tính từ chỗ đặt manifest).
 * Mục sai kiểu bị bỏ qua: manifest hỏng không làm hỏng mô hình dựng sẵn.
 */
export const normalizeManifest = (raw: unknown, manifestUrl: string): Record<string, CustomModel> => {
  const models = (raw as ModelManifest | null)?.models;
  if (!models || typeof models !== "object") return {};
  const result: Record<string, CustomModel> = {};
  for (const [name, entry] of Object.entries(models)) {
    const file = typeof entry === "string" ? entry : entry?.file;
    if (typeof file !== "string" || !file.trim() || !classKey(name)) continue;
    try {
      result[classKey(name)] = {
        url: new URL(file.trim(), manifestUrl).href,
        rotation: typeof entry === "object" && isAngles(entry.rotation) ? entry.rotation : [0, 0, 0],
      };
    } catch {
      // Đường dẫn file không hợp lệ: bỏ qua mục này
    }
  }
  return result;
};
