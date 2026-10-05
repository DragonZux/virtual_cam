/** Kiểu dữ liệu khớp với `backend/models.py`. */

export type DetectorPhase = "starting" | "ready" | "error";
export type PointerMode = "hand" | "laser";

export interface DetectionDefaults {
  targets: string[];
  confidence: number;
  tolerance: number;
}

/** GET /vision/status */
export interface VisionStatus {
  phase: DetectorPhase;
  error: string | null;
  /** GPU / CPU đang chạy YOLO */
  device: string | null;
  model: string;
  image_size: number;
  laser_model?: string | null;
  laser_error?: string | null;
  model_revision?: number;
  model_busy?: boolean;
  /** Lớp chọn làm mục tiêu được (máy chủ đã bỏ "person") */
  classes: string[];
  defaults: DetectionDefaults;
}

export interface Point {
  x: number;
  y: number;
}

export interface Detection {
  name: string;
  confidence: number;
  /** x1, y1, x2, y2 (pixel của khung đã gửi) */
  box: [number, number, number, number];
}

export interface SelectedObject {
  /** Vị trí trong `detections` */
  index: number;
  name: string;
  confidence: number;
  polygon: [number, number][];
}

/** Kết quả nhận diện một khung (WebSocket /api/camera/ws, cũng là phản hồi của POST /vision/frame) */
export interface FrameResult {
  /** Optional for compatibility with older hand-only servers. */
  pointer_mode?: PointerMode;
  laser?: { point: [number, number]; score: number } | null;
  hand_detected: boolean;
  /** 21 điểm bàn tay, toạ độ chuẩn hoá 0..1 */
  landmarks: Point[];
  /** Đầu ngón trỏ (pixel) */
  tip: [number, number] | null;
  selected: SelectedObject | null;
  detections: Detection[];
  processing_ms: number;
  resolution: { width: number; height: number };
}

/** Vật thể cần nhận diện + ngưỡng tin cậy gửi cho luồng camera (giao diện web chỉ chọn bằng laser) */
export interface FrameOptions {
  targets: string[];
  conf: number;
}

export type ModelKind = "segmentation" | "laser";
export interface ModelInfo {
  id: string;
  name: string;
  kind: ModelKind;
  size_bytes: number;
  active: boolean;
  available: boolean;
  /** .pt / .torchscript: chuyển được sang TensorRT FP16 */
  convertible?: boolean;
}
export type ConversionStatus = "queued" | "running" | "done" | "error";
/** Một lượt chuyển sang TensorRT FP16; xong thì máy chủ tự chọn engine mới */
export interface ConversionInfo {
  id: string;
  /** id mô hình gốc */
  source: string;
  name: string;
  kind: ModelKind;
  status: ConversionStatus;
  error: string | null;
  /** id engine đã tạo */
  engine: string | null;
  created_at: number;
  finished_at: number | null;
}
export interface ModelList {
  items: ModelInfo[];
  max_bytes: number;
  /** Mới nhất trước */
  conversions?: ConversionInfo[];
  convert_available?: boolean;
  /** Lý do máy chủ chưa chuyển được sang TensorRT */
  convert_reason?: string | null;
}

/** Camera RTSP người dùng thêm (lưu trên trình duyệt) */
export interface StreamLink {
  url: string;
  /** Tên tự đặt, vd. "Camera cửa" */
  name?: string;
}

/** GET /camera và bản tin "camera" của /api/camera/ws — camera máy chủ đang chạy (tối đa một) */
export interface CameraInfo {
  /** connecting = chưa có hình; reconnecting = đang chạy thì mất tín hiệu */
  status: "off" | "connecting" | "live" | "reconnecting";
  /** Địa chỉ đã bỏ tài khoản / mật khẩu */
  url: string | null;
  name: string | null;
  /** false = đang tạm dừng nhận diện */
  detect: boolean;
  error: string | null;
  width: number | null;
  height: number | null;
}

/* ===== Chỉ ở frontend ===== */

/** Cài đặt riêng của trình duyệt (localStorage). targets/confidence trống = mặc định máy chủ */
export interface Preferences {
  targets?: string[];
  confidence?: number;
  /** Giữ chấm laser trên vật thể bấy nhiêu ms mới tính là đã chọn */
  dwellMs: number;
  showOutline: boolean;
  showBoxes: boolean;
  /** Lật ngang hình camera (chế độ gương) */
  mirror: boolean;
}

export type CameraStatus = "off" | "starting" | "on" | "error";


/** Trạng thái tổng hợp hiện ở nhãn trạng thái và trên khung camera */
export type LiveState =
  | "connecting"
  | "offline"
  | "error"
  | "starting"
  | "ready"
  | "waiting"
  | "live"
  | "paused"
  | "reconnecting";
