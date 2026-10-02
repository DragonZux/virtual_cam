/** Nhận cả lệnh dán từ terminal ("ffplay rtsp://…"): lấy địa chỉ rtsp:// / rtsps:// đầu tiên */
export const parseStreamUrl = (text: string): string | null => text.match(/rtsps?:\/\/[^\s"'<>]+/i)?.[0] ?? null;

/** Không hiện tài khoản / mật khẩu camera trên khung hình */
export const displayStreamUrl = (url: string): string => url.replace(/^(rtsps?:\/\/)[^/@]*@/i, "$1");
