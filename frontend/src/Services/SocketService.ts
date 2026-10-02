import type { SocketConfig, TcpTarget } from "@/common/types";
import { API_BASE_URL } from "@/environment";
import HttpClient from "./HttpClient";

const base = `${API_BASE_URL}/sockets`;
/** WebSocket có sẵn (app khác kết nối vào) và các máy đích TCP máy chủ tự gửi vật thể đang chọn tới */
export const SocketService = {
  get: () => HttpClient.get<SocketConfig>(base, { suppressErrorNotification: true, timeout: 5000 }),
  /** Thay toàn bộ danh sách máy đích TCP (lưu trên máy chủ) */
  saveTcp: (targets: TcpTarget[]) => HttpClient.put<SocketConfig>(`${base}/tcp`, { targets },
    { suppressErrorNotification: true, timeout: 10000 }),
};
