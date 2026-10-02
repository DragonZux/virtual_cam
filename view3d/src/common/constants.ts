import type { ViewerPreferences } from "./types";

/** Đường dẫn WebSocket chỉ-đọc của backend (README › Nhận vật thể đang chọn qua WebSocket) */
export const WS_PATH = "/api/vision/ws";
/** Kết nối lại như frontend camera: đợi 0,5 giây, tăng dần tối đa 10 giây */
export const RETRY_MIN_MS = 500;
export const RETRY_MAX_MS = 10000;

/** File liệt kê mô hình GLB riêng, tương đối với trang (public/models/manifest.json) */
export const MODEL_MANIFEST_PATH = "models/manifest.json";

export const RECENT_COUNT = 8;

export const DEFAULT_PREFERENCES: ViewerPreferences = {
  wsUrl: "",
  autoRotate: true,
  keepLast: true,
};

/** Nhóm lớp COCO cho danh sách xem thử — khớp frontend/src/common/constants.ts */
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

/** Tên lớp hay gặp ở bộ dữ liệu / mô hình khác (VOC, Open Images, tự huấn luyện) → lớp COCO */
export const CLASS_ALIASES: Record<string, string> = {
  aeroplane: "airplane",
  plane: "airplane",
  motorbike: "motorcycle",
  bike: "bicycle",
  sofa: "couch",
  tvmonitor: "tv",
  "tv monitor": "tv",
  monitor: "tv",
  television: "tv",
  screen: "tv",
  diningtable: "dining table",
  table: "dining table",
  pottedplant: "potted plant",
  plant: "potted plant",
  phone: "cell phone",
  cellphone: "cell phone",
  "mobile phone": "cell phone",
  smartphone: "cell phone",
  "computer mouse": "mouse",
  "remote control": "remote",
  notebook: "laptop",
  ball: "sports ball",
  football: "sports ball",
  soccer: "sports ball",
  mug: "cup",
  glass: "wine glass",
  doughnut: "donut",
  hotdog: "hot dog",
  "hair dryer": "hair drier",
  hairdryer: "hair drier",
  teddy: "teddy bear",
  fridge: "refrigerator",
  luggage: "suitcase",
  bag: "handbag",
  purse: "handbag",
  racket: "tennis racket",
  ship: "boat",
};
