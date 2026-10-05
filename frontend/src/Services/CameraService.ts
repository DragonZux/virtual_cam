import type { StreamInfo } from "@/common/types";
import { API_BASE_URL } from "@/environment";
import HttpClient from "./HttpClient";

const base = `${API_BASE_URL}/camera/streams`;
/** Camera RTSP (MediaMTX, camera IP) đọc ở máy chủ — trình duyệt không mở trực tiếp được rtsp:// */
export const CameraService = {
  /** Lỗi (sai địa chỉ, không kết nối được) hiện nguyên văn thông báo của máy chủ */
  openStream: (url: string) => HttpClient.post<StreamInfo>(base, { url }, { timeout: 20000 }),
  /** Khung JPEG mới hơn khung đã nhận; 504 = chưa có khung mới, 404 = phiên đã đóng */
  frame: (id: string) => HttpClient.get<Blob>(`${base}/${id}/frame`, {
    responseType: "blob", headers: { Accept: "image/jpeg" }, suppressErrorNotification: true, timeout: 10000,
  }),
  closeStream: (id: string) => HttpClient.delete<void>(`${base}/${id}`, { suppressErrorNotification: true, timeout: 5000 }),
};
