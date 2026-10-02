import { expect, test } from "@playwright/test";
import type { FrameResult } from "../src/common/types";
import { smoothPointer } from "../src/utils/smoothing";

const laserFrame = (x: number): FrameResult => ({
  landmarks: [], hand_detected: false, tip: null, selected: null, detections: [],
  laser: { point: [x, 180], color: "red", score: 0.9 },
  resolution: { width: 640, height: 360 }, processing_ms: 30,
});

test("smoothing is independent of display refresh rate", () => {
  const target = laserFrame(340);
  const at30Hz = smoothPointer(laserFrame(300), target, 1000 / 30);
  const at60Hz = smoothPointer(smoothPointer(laserFrame(300), target, 1000 / 60), target, 1000 / 60);
  expect(at30Hz.laser!.point[0]).toBeCloseTo(at60Hz.laser!.point[0], 10);
});

test("rotated frames are displayed immediately", () => {
  const rotated = { ...laserFrame(110), resolution: { width: 360, height: 640 } };
  expect(smoothPointer(laserFrame(100), rotated, 16)).toBe(rotated);
});

test("the laser dot glides between results without touching the result", () => {
  const start = laserFrame(300);
  const target = laserFrame(340);
  const displayed = smoothPointer(start, target, 16);
  expect(displayed.laser!.point[0]).toBeGreaterThan(300);
  expect(displayed.laser!.point[0]).toBeLessThan(340);
  expect(displayed.laser!.point[1]).toBe(180);
  expect(target.laser!.point).toEqual([340, 180]);
  expect(smoothPointer(displayed, target, 200).laser!.point[0]).toBeCloseTo(340, 1);
});

test("a far laser spot, a lost dot or a new dot is drawn at once", () => {
  const start = laserFrame(100);
  const far = laserFrame(500);
  expect(smoothPointer(start, far, 16)).toBe(far);
  const lost = { ...laserFrame(110), laser: null };
  expect(smoothPointer(start, lost, 16)).toBe(lost);
  const found = laserFrame(120);
  expect(smoothPointer(lost, found, 16)).toBe(found);
});
