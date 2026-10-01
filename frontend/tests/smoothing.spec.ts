import { expect, test } from "@playwright/test";
import type { FrameResult } from "../src/common/types";
import { smoothPointer } from "../src/utils/smoothing";

const frame = (x: number): FrameResult => ({
  landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.5 })),
  hand_detected: true, tip: [x * 640, 180], selected: null, detections: [],
  resolution: { width: 640, height: 360 }, processing_ms: 30,
});

const laserFrame = (x: number): FrameResult => ({
  landmarks: [], hand_detected: false, tip: null, selected: null, detections: [],
  laser: { point: [x, 180], color: "red", score: 0.9 },
  resolution: { width: 640, height: 360 }, processing_ms: 30,
});

test("hand motion converges without overshoot and does not mutate inference results", () => {
  const start = frame(0.4);
  const target = frame(0.5);
  const displayed = smoothPointer(start, target, 16);
  expect(displayed.landmarks[8].x).toBeGreaterThan(0.4);
  expect(displayed.landmarks[8].x).toBeLessThan(0.5);
  expect(target.landmarks[8].x).toBe(0.5);
  expect(start.landmarks[8].x).toBe(0.4);
  expect(displayed.tip![0] / 640).toBeCloseTo(displayed.landmarks[8].x);
  expect(smoothPointer(displayed, target, 200).landmarks[8].x).toBeCloseTo(0.5, 3);
});

test("smoothing is independent of display refresh rate", () => {
  const target = frame(0.5);
  const at30Hz = smoothPointer(frame(0.4), target, 1000 / 30);
  const at60Hz = smoothPointer(smoothPointer(frame(0.4), target, 1000 / 60), target, 1000 / 60);
  expect(at30Hz.landmarks[8].x).toBeCloseTo(at60Hz.landmarks[8].x, 10);
});

test("lost hands, large jumps and rotated frames are displayed immediately", () => {
  const previous = frame(0.1);
  const jump = frame(0.8);
  expect(smoothPointer(previous, jump, 16)).toBe(jump);
  const missing = { ...frame(0.1), hand_detected: false, landmarks: [], tip: null };
  expect(smoothPointer(previous, missing, 16)).toBe(missing);
  const rotated = { ...frame(0.15), resolution: { width: 360, height: 640 } };
  expect(smoothPointer(previous, rotated, 16)).toBe(rotated);
});

test("the laser dot glides between results like the fingertip without touching the result", () => {
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
