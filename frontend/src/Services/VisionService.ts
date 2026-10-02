import type { Observable } from "rxjs";

import type { FrameOptions, FrameResult, VisionStatus } from "@/common/types";
import HttpClient from "./HttpClient";
import { APIHosts, ApiReduxHelpers } from "./reduxHelpers";

class VisionController extends ApiReduxHelpers {
  ApiHost = APIHosts.Api;
  private base = () => `${this.getHost(this.ApiHost)}/vision`;

  public Get = {
    /** GET /vision/status — trạng thái bộ nhận diện, lớp chọn được, mặc định máy chủ (hỏi định kỳ, lỗi hiện ở nhãn trạng thái) */
    status: (): Observable<VisionStatus> =>
      HttpClient.get<VisionStatus>(`${this.base()}/status`, { suppressErrorNotification: true, timeout: 5000 }),
  };

  public Post = {
    /** POST /vision/frame — một khung JPEG của camera → chấm laser + vật thể đang được chỉ */
    frame: (image: Blob, options: FrameOptions, laserHint?: [number, number] | null): Observable<FrameResult> =>
      HttpClient.post<FrameResult>(`${this.base()}/frame`, image, {
        search: {
          targets: options.targets.join(","), conf: options.conf,
          pointer_mode: options.pointer_mode,
          model_revision: options.model_revision,
          // Chấm laser đang bám ở khung trước: máy chủ ưu tiên ứng viên gần đó thay vì đốm sáng khác
          laser_hint: laserHint ? laserHint.join(",") : undefined,
        },
        headers: { "Content-Type": "image/jpeg" },
        // Khung hình gửi liên tục: lỗi hiện trên khung camera thay vì bật thông báo mỗi lần
        suppressErrorNotification: true,
        timeout: 15000,
      }),
  };
}

export const VisionService = new VisionController();
