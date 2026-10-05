/** Kiểu dữ liệu khớp với WebSocket `/api/vision/ws` của backend (`services/selection_stream.py`). */

export type PointerMode = "hand" | "laser";
/** Nguồn hình trên trang camera: camera của trình duyệt hoặc ảnh / video thử */
export type FrameSource = "camera" | "media";

/** Vật thể đã xác nhận; confidence 0–1, làm tròn theo phần trăm hiển thị trên trang camera */
export interface SelectionSummary {
  name: string;
  confidence: number;
}

/** Trạng thái một phiên trình duyệt camera (nội dung bản tin `selection.changed`) */
export interface SelectionSession {
  session_id: string;
  /** null: chưa xác nhận / đã bỏ chọn / camera dừng */
  selected: SelectionSummary | null;
  pointer_mode: PointerMode;
  source: FrameSource;
  /** false: phiên vừa ngắt kết nối, bên nhận xoá phiên */
  connected: boolean;
  /** Thời gian máy chủ, Unix ms */
  timestamp: number;
}

export interface SelectionSnapshotMessage {
  type: "selection.snapshot";
  sessions: SelectionSession[];
}

export interface SelectionChangedMessage extends SelectionSession {
  type: "selection.changed";
}

export type SelectionMessage = SelectionSnapshotMessage | SelectionChangedMessage;

/** SelectionStreamService phát ra: trạng thái kết nối hoặc một bản tin của máy chủ */
export type StreamSignal =
  | { kind: "connecting"; url: string }
  | { kind: "open"; url: string }
  | { kind: "closed"; url: string; retryInMs: number }
  | { kind: "message"; message: SelectionMessage };

export type ConnectionStatus = "connecting" | "open" | "closed";

/* ===== Chỉ ở màn hình 3D ===== */

/** Một lựa chọn (không null) đã nhận từ một phiên camera */
export interface ShownSelection {
  session_id: string;
  name: string;
  confidence: number;
  pointer_mode: PointerMode;
  source: FrameSource;
  timestamp: number;
}

/** live = đang chọn; last = vừa chọn (phiên đã bỏ chọn, vẫn giữ trên màn hình); preview = người xem tự chọn để xem thử */
export type DisplayKind = "live" | "last" | "preview";

export interface DisplayedObject {
  kind: DisplayKind;
  name: string;
  /** null khi xem thử */
  selection: ShownSelection | null;
}

export interface RecentObject {
  id: number;
  name: string;
  confidence: number;
  session_id: string;
  /** Thời gian máy chủ, Unix ms */
  timestamp: number;
}

/** Cài đặt riêng của trình duyệt này (localStorage) */
export interface ViewerPreferences {
  autoRotate: boolean;
  /** Giữ vật thể vừa chọn trên màn hình khi phiên camera bỏ chọn */
  keepLast: boolean;
}

/** public/models/manifest.json: tên lớp → file GLB riêng (thay mô hình dựng sẵn) */
export interface ModelManifestEntry {
  file: string;
  /** Xoay thêm (độ) quanh x, y, z nếu file quay sai hướng */
  rotation?: [number, number, number];
}

export interface ModelManifest {
  models?: Record<string, string | ModelManifestEntry>;
}

/** Mô hình GLB riêng đã chuẩn hoá: URL tuyệt đối + góc xoay (độ) */
export interface CustomModel {
  url: string;
  rotation: [number, number, number];
}
