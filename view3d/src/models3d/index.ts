import { memo, type ComponentType } from "react";

import { canonicalClass } from "@/utils/format";
import * as accessories from "./accessories";
import * as animals from "./animals";
import * as appliances from "./appliances";
import * as electronics from "./electronics";
import * as food from "./food";
import * as furniture from "./furniture";
import { GenericObject } from "./generic";
import * as indoor from "./indoor";
import * as kitchen from "./kitchen";
import * as outdoor from "./outdoor";
import * as sports from "./sports";
import * as vehicles from "./vehicles";

export interface ModelProps {
  /** Tên lớp gốc nhận từ máy chủ */
  name: string;
}

export type ModelComponent = ComponentType<ModelProps>;

/** Lớp COCO mà máy chủ có thể trả (trừ "person" — không bao giờ là mục tiêu) */
const BUILTIN: Record<string, ComponentType> = {
  // Thiết bị điện tử
  laptop: electronics.Laptop,
  mouse: electronics.Mouse,
  keyboard: electronics.Keyboard,
  "cell phone": electronics.CellPhone,
  remote: electronics.Remote,
  tv: electronics.Tv,
  // Đồ dùng trong nhà
  book: indoor.Book,
  clock: indoor.Clock,
  vase: indoor.Vase,
  scissors: indoor.Scissors,
  "teddy bear": indoor.TeddyBear,
  "hair drier": indoor.HairDrier,
  toothbrush: indoor.Toothbrush,
  // Nhà bếp
  bottle: kitchen.Bottle,
  "wine glass": kitchen.WineGlass,
  cup: kitchen.Cup,
  fork: kitchen.Fork,
  knife: kitchen.Knife,
  spoon: kitchen.Spoon,
  bowl: kitchen.Bowl,
  // Nội thất
  chair: furniture.Chair,
  couch: furniture.Couch,
  "potted plant": furniture.PottedPlant,
  bed: furniture.Bed,
  "dining table": furniture.DiningTable,
  toilet: furniture.Toilet,
  // Đồ gia dụng
  microwave: appliances.Microwave,
  oven: appliances.Oven,
  toaster: appliances.Toaster,
  sink: appliances.Sink,
  refrigerator: appliances.Refrigerator,
  // Phụ kiện
  backpack: accessories.Backpack,
  umbrella: accessories.Umbrella,
  handbag: accessories.Handbag,
  tie: accessories.Tie,
  suitcase: accessories.Suitcase,
  // Thực phẩm
  banana: food.Banana,
  apple: food.Apple,
  sandwich: food.Sandwich,
  orange: food.Orange,
  broccoli: food.Broccoli,
  carrot: food.Carrot,
  "hot dog": food.HotDog,
  pizza: food.Pizza,
  donut: food.Donut,
  cake: food.Cake,
  // Thể thao
  frisbee: sports.Frisbee,
  skis: sports.Skis,
  snowboard: sports.Snowboard,
  "sports ball": sports.SportsBall,
  kite: sports.Kite,
  "baseball bat": sports.BaseballBat,
  "baseball glove": sports.BaseballGlove,
  skateboard: sports.Skateboard,
  surfboard: sports.Surfboard,
  "tennis racket": sports.TennisRacket,
  // Phương tiện
  bicycle: vehicles.Bicycle,
  car: vehicles.Car,
  motorcycle: vehicles.Motorcycle,
  airplane: vehicles.Airplane,
  bus: vehicles.Bus,
  train: vehicles.Train,
  truck: vehicles.Truck,
  boat: vehicles.Boat,
  // Ngoài trời
  "traffic light": outdoor.TrafficLight,
  "fire hydrant": outdoor.FireHydrant,
  "stop sign": outdoor.StopSign,
  "parking meter": outdoor.ParkingMeter,
  bench: outdoor.Bench,
  // Động vật
  bird: animals.Bird,
  cat: animals.Cat,
  dog: animals.Dog,
  horse: animals.Horse,
  sheep: animals.Sheep,
  cow: animals.Cow,
  elephant: animals.Elephant,
  bear: animals.Bear,
  zebra: animals.Zebra,
  giraffe: animals.Giraffe,
};

/** Mô hình tĩnh: memo để cảnh vẽ lại (đổi độ tin cậy, trạng thái kết nối…) không dựng lại hình */
const LIBRARY: Record<string, ModelComponent> = Object.fromEntries(
  Object.entries(BUILTIN).map(([key, Model]) => [key, memo(Model as ModelComponent)]),
);

/** Khoá lớp có mô hình dựng sẵn ("Cell_Phone", "sofa"… vẫn khớp); null nếu không có */
export const resolveModelKey = (name: string): string | null => {
  const key = canonicalClass(name);
  return LIBRARY[key] ? key : null;
};

/** Mô hình theo khoá lớp; không có → hộp nhãn tên vật thể */
export const getModel = (key: string | null): ModelComponent => (key && LIBRARY[key]) || GenericObject;

/** Mọi lớp có mô hình dựng sẵn (danh sách xem thử, kiểm thử) */
export const BUILTIN_KEYS: string[] = Object.keys(LIBRARY);
