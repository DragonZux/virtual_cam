import { App } from "antd";
import { useEffect } from "react";

import { setMessageApi } from "@/utils/notify";

/** Lấy message instance từ <App> antd cho code ngoài React (epics, HttpClient). */
export const AntdHolder = () => {
  const { message } = App.useApp();
  useEffect(() => setMessageApi(message), [message]);
  return null;
};
