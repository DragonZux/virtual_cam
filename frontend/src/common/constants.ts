import type { Preferences } from "./types";

export const ROUTES = {
  live: "/",
  test: "/test",
  history: "/history",
  settings: "/settings",
  guide: "/guide",
} as const;

export type RouteKey = keyof typeof ROUTES;

/** Cạnh dài khung gửi lên máy chủ — YOLO chạy imgsz 640 nên gửi lớn hơn không chính xác hơn */
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
/** Giữ tên vật thể thêm một chút sau khi ngón tay rời đi để không nhấp nháy */
export const HOLD_MS = 500;
export const STATUS_POLL_MS = 3000;
export const MAX_HISTORY = 200;
export const RECENT_COUNT = 4;

/** Đuôi ảnh / video phát được trong khung camera */
export const MEDIA_EXTENSIONS = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"],
  video: [".mp4", ".m4v", ".webm", ".mov", ".ogv"],
} as const;
/** Cạnh dài tối đa khi đưa ảnh tĩnh vào luồng hình */
export const IMAGE_MAX_SIDE = 1920;

export const DEFAULT_PREFERENCES: Preferences = {
  pointerMode: "hand",
  dwellMs: 300,
  showHand: true,
  showTip: true,
  showOutline: true,
  showBoxes: true,
  mirror: "auto",
  voice: false,
};

/** Giới hạn thanh trượt ở Cài đặt — nằm trong ràng buộc Query của backend */
export const CONFIDENCE_RANGE = { min: 0.05, max: 0.9, step: 0.05 };
export const TOLERANCE_RANGE = { min: 0, max: 80, step: 5 };
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

/** 21 điểm MediaPipe — các đoạn nối thành khung xương bàn tay */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
