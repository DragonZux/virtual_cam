import type { AjaxRequest } from "rxjs/ajax";

export type StringKeyValue = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = Partial<AjaxRequest> & {
  /** Query string params */
  search?: StringKeyValue;
  headers?: Record<string, string>;
  /** true = tắt message lỗi; mảng = tắt cho các status này */
  suppressErrorNotification?: boolean | number[];
};
