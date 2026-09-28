import type { Observable } from "rxjs";

import type { MediaItem, MediaList } from "@/common/types";
import HttpClient from "./HttpClient";
import { APIHosts, ApiReduxHelpers } from "./reduxHelpers";

class MediaController extends ApiReduxHelpers {
  ApiHost = APIHosts.Api;
  private base = () => `${this.getHost(this.ApiHost)}/media`;

  public Get = {
    /** GET /media — ảnh / video đã tải lên, thư mục lưu và dung lượng tối đa */
    list: (): Observable<MediaList> => HttpClient.get<MediaList>(this.base(), { suppressErrorNotification: true }),
  };

  public Post = {
    /** POST /media?name= — gửi nguyên file (không multipart), máy chủ ghi vào thư mục lưu */
    upload: (file: File): Observable<MediaItem> =>
      HttpClient.post<MediaItem>(this.base(), file, {
        search: { name: file.name },
        headers: { "Content-Type": file.type || "application/octet-stream" },
      }),
  };
}

export const MediaService = new MediaController();
