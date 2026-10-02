import type { ModelKind, ModelList, VisionStatus } from "@/common/types";
import { API_BASE_URL } from "@/environment";
import HttpClient from "./HttpClient";

const base = `${API_BASE_URL}/models`;
export const ModelService = {
  list: () => HttpClient.get<ModelList>(base, { suppressErrorNotification: true, timeout: 5000 }),
  activate: (id: string) => HttpClient.post<VisionStatus>(`${base}/activate`, { id },
    { suppressErrorNotification: true, timeout: 300000 }),
  /** convert: tải xong thì máy chủ chuyển sang TensorRT FP16 ở nền */
  upload: (kind: ModelKind, file: File, convert = false) => HttpClient.post<ModelList>(base, file, {
    search: { kind, name: file.name, convert }, headers: { "Content-Type": "application/octet-stream" },
    suppressErrorNotification: true, timeout: 600000,
  }),
  convert: (id: string) => HttpClient.post<ModelList>(`${base}/convert`, { id }, { suppressErrorNotification: true, timeout: 10000 }),
};
