import type { Observable } from "rxjs";

import type { VisionStatus } from "@/common/types";
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
}

export const VisionService = new VisionController();
