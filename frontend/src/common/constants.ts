import type { ModelKind, Preferences } from "./types";

export const ROUTES = {
  live: "/",
  settings: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Mỗi loại chạy một mô hình (Cài đặt › Quản lý mô hình AI) */
export const MODEL_KINDS: ModelKind[] = ["segmentation", "laser"];

/** Cạnh dài mặc định khi chụp khung (capture.ts) — YOLO chạy imgsz 640 */
export const UPLOAD_MAX_SIDE = 640;
/** Preserve small laser spots before YOLO resizes its own input. */
export const LASER_UPLOAD_MAX_SIDE = 1280;
/** Chất lượng JPEG ở chế độ laser đỏ: mô hình AI vẫn bắt đúng chấm ở 0.8 mà khung nhẹ đi khoảng một nửa so với 0.94 */
export const LASER_JPEG_QUALITY = 0.8;
/** Cạnh dài khung hiển thị / ảnh chụp (nét hơn khung gửi đi) */
export const DISPLAY_MAX_SIDE = 1280;
export const JPEG_QUALITY = 0.82;
/** Khoảng tối thiểu giữa hai khung gửi đi (≈ tối đa 30 khung/giây, bằng camera) */
export const MIN_FRAME_INTERVAL_MS = 33;
/**
 * Giới hạn cứng số request đang chờ; nhịp gửi còn được điều tiết theo thời gian xử lý của máy chủ.
 */
export const MAX_FRAMES_IN_FLIGHT = 2;
/** Giữ tên vật thể thêm một chút sau khi chấm laser rời đi để không nhấp nháy */
export const HOLD_MS = 500;
export const STATUS_POLL_MS = 3000;

export const DEFAULT_PREFERENCES: Preferences = {
  dwellMs: 300,
  showOutline: true,
  showBoxes: true,
  mirror: false,
};

/** Giới hạn thanh trượt ở Cài đặt — nằm trong ràng buộc Query của backend */
export const CONFIDENCE_RANGE = { min: 0.05, max: 0.9, step: 0.05 };
export const DWELL_RANGE = { min: 0, max: 1500, step: 50 };

/** Nhóm lớp COCO để chọn vật thể; lớp không có ở đây vào nhóm "other" */
export const CLASS_GROUPS: { key: string; classes: string[] }[] = [
  { key: "electronic", classes: ["laptop", "mouse", "keyboard", "cell phone", "remote", "tv"] },
  { key: "indoor", classes: ["book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"] },
  { key: "kitchen", classes: ["bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl"] },
  { key: "furniture", classes: ["chair", "couch", "potted plant", "bed", "dining table", "toilet"] },
  { key: "appliance", classes: ["microwave", "oven", "toaster", "sink", "refrigerator"] },
  { key: "accessory", classes: ["backpack", "umbrella", "handbag", "tie", "suitcase"] },
  {
    key: "food",
    classes: ["banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"],
  },
  {
    key: "sports",
    classes: [
      "frisbee",
      "skis",
      "snowboard",
      "sports ball",
      "kite",
      "baseball bat",
      "baseball glove",
      "skateboard",
      "surfboard",
      "tennis racket",
    ],
  },
  { key: "vehicle", classes: ["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"] },
  { key: "outdoor", classes: ["traffic light", "fire hydrant", "stop sign", "parking meter", "bench"] },
  { key: "animal", classes: ["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"] },
];
