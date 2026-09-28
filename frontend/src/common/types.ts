/** Kiểu dữ liệu khớp với `backend/models.py`. */

export type DetectorPhase = "starting" | "ready" | "error";
export type PointerMode = "hand" | "laser";
export type LaserColor = "red" | "green";

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
  /** Lớp chọn làm mục tiêu được (máy chủ đã bỏ "person") */
  classes: string[];
  defaults: DetectionDefaults;
  /** Địa chỉ HTTPS cho thiết bị khác — chỉ có khi máy chủ chạy `serve.py --lan` */
  share_urls: string[];
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
  laser?: { point: [number, number]; color: LaserColor; score: number } | null;
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
  pointer_mode: PointerMode;
  laser_color: LaserColor;
  laser_brightness: number;
  targets: string[];
  conf: number;
  tolerance: number;
}

/* ===== Chỉ ở frontend ===== */

export type MirrorMode = "auto" | "on" | "off";

/** Cài đặt riêng của trình duyệt (localStorage). targets/confidence/tolerance trống = mặc định máy chủ */
export interface Preferences {
  pointerMode: PointerMode;
  laserColor: LaserColor;
  laserBrightness: number;
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

export interface CameraDevice {
  deviceId: string;
  label: string;
}

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
