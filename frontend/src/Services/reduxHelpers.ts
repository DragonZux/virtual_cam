import { API_BASE_URL } from "@/environment";

export enum APIHosts {
  Api = "hostApi",
}

/** Base class cho các Service: resolve host theo cấu hình môi trường. */
export class ApiReduxHelpers {
  config: Record<APIHosts, string> = { [APIHosts.Api]: API_BASE_URL };

  getHost = (apiHost: APIHosts): string => this.config[apiHost];
}
