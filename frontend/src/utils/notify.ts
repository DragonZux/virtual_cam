import { message as staticMessage } from "antd";
import type { MessageInstance } from "antd/es/message/interface";

// antd khuyến nghị dùng App.useApp() thay cho message tĩnh (để nhận theme/context).
// Epic/HttpClient không phải component nên nhận instance qua holder này (đặt trong <AntApp>).
let api: MessageInstance | null = null;

export const setMessageApi = (instance: MessageInstance) => {
  api = instance;
};

export const notify = {
  success: (content: string) => (api ?? staticMessage).success(content),
  error: (content: string) => (api ?? staticMessage).error(content),
  info: (content: string) => (api ?? staticMessage).info(content),
  warning: (content: string) => (api ?? staticMessage).warning(content),
};
