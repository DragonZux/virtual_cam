import { expect, test } from "@playwright/test";
import type { TFunction } from "i18next";
import { DEFAULT_PREFERENCES } from "../src/common/constants";
import { getActiveTargets } from "../src/store/setting/settingSelector";
import type { RootState } from "../src/store/types";
import { classKey, objectLabel } from "../src/utils/format";

const state = (targets: string[] | undefined, classes: string[], defaults: string[]) =>
  ({
    setting: { prefs: { ...DEFAULT_PREFERENCES, targets } },
    vision: { status: { classes, defaults: { targets: defaults, confidence: 0.8, tolerance: 30 } } },
  }) as unknown as RootState;

test("class names compare like the server: case and extra spaces do not matter", () => {
  expect(classKey(" Cell  Phone ")).toBe("cell phone");
  const t = ((key: string, options?: { defaultValue?: string }) =>
    key === "classes.laptop" ? "Máy tính xách tay" : options?.defaultValue) as unknown as TFunction;
  expect(objectLabel(t, "Laptop")).toBe("Máy tính xách tay");
  expect(objectLabel(t, "Drone")).toBe("Drone");
});

test("saved targets map to the server's spelling, unknown ones are dropped", () => {
  expect(getActiveTargets(state(["LAPTOP", "ghost", "Mouse", "laptop"], ["cup", "laptop", "mouse"], ["cup"])))
    .toEqual(["laptop", "mouse"]);
  // Chỉ còn mô hình Open Images: "laptop" đã lưu vẫn được chọn dưới tên "Laptop"
  expect(getActiveTargets(state(["laptop"], ["Drone", "Laptop"], ["Drone"]))).toEqual(["Laptop"]);
});

test("nothing saved or nothing left falls back to the server defaults", () => {
  expect(getActiveTargets(state(undefined, ["cup", "laptop"], ["laptop"]))).toEqual(["laptop"]);
  expect(getActiveTargets(state(["ghost"], ["cup", "laptop"], ["laptop"]))).toEqual(["laptop"]);
});
