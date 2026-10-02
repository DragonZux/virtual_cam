import type { ModelKind, ModelList } from "@/common/types";
import { API_BASE_URL } from "@/environment";
import HttpClient from "./HttpClient";

const base = `${API_BASE_URL}/models`;
export const ModelService = {
  list: () => HttpClient.get<ModelList>(base, { suppressErrorNotification: true, timeout: 5000 }),
  /** Máy chủ nạp và dùng ngay mô hình mới; convert: sau đó chuyển sang TensorRT FP16 ở nền */
  upload: (kind: ModelKind, file: File, convert = false) => HttpClient.post<ModelList>(base, file, {
    search: { kind, name: file.name, convert }, headers: { "Content-Type": "application/octet-stream" },
    suppressErrorNotification: true, timeout: 600000,
  }),
};
