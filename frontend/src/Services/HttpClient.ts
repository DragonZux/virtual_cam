// HTTP qua RxJS ajax (không dùng axios/fetch) — cùng pattern quan_ly_lop_hoc / doc-ai-web, rút gọn: không đăng nhập.
import { Observable, throwError } from "rxjs";
import { ajax, AjaxError } from "rxjs/ajax";
import { catchError, map } from "rxjs/operators";
import i18next from "i18next";

import { notify } from "@/utils/notify";

import { buildRequestUrl } from "./HttpHelper";
import type { RequestOptions } from "./types";

/* ===== error handling ===== */
const MAX_API_ERROR_LENGTH = 500;

const cleanApiErrorText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || text.startsWith("<")) return undefined;
  return text.length > MAX_API_ERROR_LENGTH ? `${text.slice(0, MAX_API_ERROR_LENGTH)}…` : text;
};

// FastAPI trả "detail" (chuỗi, hoặc mảng {loc,msg} với lỗi 422) — hiện nguyên văn cho người dùng.
export const extractApiErrorMessage = (err: AjaxError): string | undefined => {
  const response = err?.response as { detail?: unknown; message?: unknown } | string | undefined;
  if (!response) return undefined;
  if (typeof response === "string") return cleanApiErrorText(response);
  if (typeof response !== "object") return undefined;
  const detail = response.detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: { msg?: string }) => cleanApiErrorText(item?.msg ?? item))
      .filter(Boolean);
    return messages.length ? cleanApiErrorText(messages.join("; ")) : undefined;
  }
  return cleanApiErrorText(detail) ?? cleanApiErrorText(response.message);
};

export const handleHttpError = (err: AjaxError, suppress?: boolean | number[]): void => {
  if (suppress === true) return;
  if (Array.isArray(suppress) && err?.status && suppress.includes(err.status)) return;
  const key = err?.status ? `httpError.${err.status}` : "httpError.default";
  const userMessage =
    extractApiErrorMessage(err) ?? i18next.t(key, { defaultValue: i18next.t("httpError.default") });
  notify.error(userMessage);
};

export class HttpMethod {
  static GET = "GET";
  static POST = "POST";
  static PATCH = "PATCH";
  static DELETE = "DELETE";
}

/* ===== core request ===== */
const request = <T>(method: string, url: string, body?: unknown, options: RequestOptions = {}): Observable<T> => {
  const { search, headers = {}, suppressErrorNotification, ...rest } = options;
  // FormData (upload file) gửi nguyên để trình duyệt tự đặt multipart boundary; Blob (ảnh camera) gửi nguyên kèm type
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const blob = typeof Blob !== "undefined" && body instanceof Blob ? body : null;
  return ajax<T>({
    url: buildRequestUrl(url, search),
    method,
    body: body === undefined ? undefined : isForm || blob ? body : JSON.stringify(body),
    headers: {
      ...(isForm ? {} : { "Content-Type": blob ? blob.type || "application/octet-stream" : "application/json" }),
      Accept: "application/json",
      ...headers,
    },
    ...rest,
  }).pipe(
    map((res) => res.response as T),
    catchError((err: AjaxError) => {
      handleHttpError(err, suppressErrorNotification);
      return throwError(() => err);
    }),
  );
};

const HttpClient = {
  get: <T>(url: string, options?: RequestOptions) => request<T>(HttpMethod.GET, url, undefined, options),
  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(HttpMethod.POST, url, body, options),
  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(HttpMethod.PATCH, url, body, options),
  delete: <T>(url: string, options?: RequestOptions) => request<T>(HttpMethod.DELETE, url, undefined, options),
};

export default HttpClient;
