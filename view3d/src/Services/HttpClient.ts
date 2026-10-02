// HTTP qua RxJS ajax (không dùng axios/fetch) — cùng pattern frontend/src/Services/HttpClient.ts.
// Màn hình 3D chỉ đọc file tĩnh (manifest mô hình); lỗi do nơi gọi tự xử lý, không hiện thông báo.
import type { Observable } from "rxjs";
import { ajax } from "rxjs/ajax";
import { map } from "rxjs/operators";

const get = <T>(url: string): Observable<T> =>
  ajax<T>({ url, method: "GET", headers: { Accept: "application/json" }, responseType: "json" }).pipe(
    map((res) => res.response as T),
  );

const HttpClient = { get };

export default HttpClient;
