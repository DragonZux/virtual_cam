import type { CameraInfo } from "@/common/types";
import { API_BASE_URL } from "@/environment";
import HttpClient from "./HttpClient";

const base = `${API_BASE_URL}/camera`;

/** Camera máy chủ giữ (tối đa một): chạy kể cả khi đóng trang, chỉ "Tắt camera" mới dừng */
export const CameraService = {
  /** Chạy camera này thay camera đang chạy; lỗi (sai địa chỉ, không có hình) hiện nguyên văn thông báo máy chủ */
  start: (url: string, name?: string) => HttpClient.put<CameraInfo>(base, { url, name: name ?? null }, { timeout: 20000 }),
  stop: () => HttpClient.delete<void>(base, { timeout: 5000 }),
  /** false = tạm dừng nhận diện (hình vẫn chạy) */
  setDetect: (detect: boolean) => HttpClient.put<CameraInfo>(`${base}/detect`, { detect }, { timeout: 5000 }),
};
