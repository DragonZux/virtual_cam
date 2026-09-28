import type { Observable } from "rxjs";

import type { ModelInfo, ModelList } from "@/common/types";
import HttpClient from "./HttpClient";
import { APIHosts, ApiReduxHelpers } from "./reduxHelpers";

class ModelController extends ApiReduxHelpers {
  ApiHost = APIHosts.Api;
  private base = () => `${this.getHost(this.ApiHost)}/models`;
  private item = (id: string) => `${this.base()}/${encodeURIComponent(id)}`;

  public Get = {
    /** GET /models — mô hình, quyền quản lý của trình duyệt này, thư mục lưu */
    list: (): Observable<ModelList> => HttpClient.get<ModelList>(this.base(), { suppressErrorNotification: true }),
  };

  public Post = {
    /** POST /models?name= — gửi nguyên file .pt; máy chủ nạp thử rồi cho chạy cùng các mô hình khác */
    upload: (file: File): Observable<ModelInfo> =>
      HttpClient.post<ModelInfo>(this.base(), file, {
        search: { name: file.name },
        headers: { "Content-Type": "application/octet-stream" },
      }),
  };

  public Patch = {
    /** PATCH /models/{id} — bật / tắt (tắt thì giải phóng GPU, giữ file) */
    enabled: (id: string, enabled: boolean): Observable<ModelInfo> => HttpClient.patch<ModelInfo>(this.item(id), { enabled }),
  };

  public Delete = {
    /** DELETE /models/{id} — xoá mô hình tải thêm và file .pt */
    remove: (id: string): Observable<null> => HttpClient.delete<null>(this.item(id)),
  };
}

export const ModelService = new ModelController();
