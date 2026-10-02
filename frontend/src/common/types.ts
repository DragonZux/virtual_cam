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

/** POST /vision/frame */
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

/** Cài đặt gửi kèm từng khung hình (query của POST /vision/frame) */
export interface FrameOptions {
  model_revision?: number;
  pointer_mode: PointerMode;
  targets: string[];
  conf: number;
  tolerance: number;
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

export type MediaKind = "image" | "video";

/* ===== Chỉ ở frontend ===== */

export type MirrorMode = "auto" | "on" | "off";

/** Cài đặt riêng của trình duyệt (localStorage). targets/confidence/tolerance trống = mặc định máy chủ */
export interface Preferences {
  pointerMode: PointerMode;
  targets?: string[];
  confidence?: number;
  tolerance?: number;
  /** Giữ ngón tay trên vật thể bấy nhiêu ms mới tính là một lượt chọn */
  dwellMs: number;
  showHand: boolean;
  showTip: boolean;
  showOutline: boolean;
  showBoxes: boolean;
  mirror: MirrorMode;
  voice: boolean;
}

export interface SelectionEvent {
  pointerMode?: PointerMode;
  id: number;
  name: string;
  confidence: number;
  /** epoch ms */
  time: number;
}

export type CameraStatus = "off" | "starting" | "on" | "error";

/** Nguồn hình của khung camera: camera của trình duyệt hoặc ảnh / video thử */
export type FrameSource = "camera" | "media";

/** Confirmed selection shared over WebSocket; confidence matches the displayed percentage. */
export interface SelectionUpdate {
  selected: Pick<SelectedObject, "name" | "confidence"> | null;
  pointer_mode: PointerMode;
  source: FrameSource;
}

/** Ảnh / video đang phát trong khung camera — url là blob: của file vừa chọn trên máy */
export interface MediaSource {
  url: string;
  name: string;
  kind: MediaKind;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Trạng thái tổng hợp hiện ở nhãn trạng thái và trên khung camera */
export type LiveState =
  | "analyzing"
  | "complete"
  | "connecting"
  | "offline"
  | "error"
  | "starting"
  | "ready"
  | "waiting"
  | "live"
  | "paused"
  | "reconnecting";
