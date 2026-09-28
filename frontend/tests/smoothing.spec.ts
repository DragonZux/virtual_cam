import { expect, test } from "@playwright/test";
import type { FrameResult } from "../src/common/types";
import { smoothHand } from "../src/utils/smoothing";

const frame = (x: number): FrameResult => ({
  landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.5 })),
  hand_detected: true, tip: [x * 640, 180], selected: null, detections: [],
  resolution: { width: 640, height: 360 }, processing_ms: 30,
});

test("hand motion converges without overshoot and does not mutate inference results", () => {
  const start = frame(0.4);
  const target = frame(0.5);
  const displayed = smoothHand(start, target, 16);
  expect(displayed.landmarks[8].x).toBeGreaterThan(0.4);
  expect(displayed.landmarks[8].x).toBeLessThan(0.5);
  expect(target.landmarks[8].x).toBe(0.5);
  expect(start.landmarks[8].x).toBe(0.4);
  expect(displayed.tip![0] / 640).toBeCloseTo(displayed.landmarks[8].x);
  expect(smoothHand(displayed, target, 200).landmarks[8].x).toBeCloseTo(0.5, 3);
});

test("smoothing is independent of display refresh rate", () => {
  const target = frame(0.5);
  const at30Hz = smoothHand(frame(0.4), target, 1000 / 30);
  const at60Hz = smoothHand(smoothHand(frame(0.4), target, 1000 / 60), target, 1000 / 60);
  expect(at30Hz.landmarks[8].x).toBeCloseTo(at60Hz.landmarks[8].x, 10);
});

test("lost hands, large jumps and rotated frames are displayed immediately", () => {
  const previous = frame(0.1);
  const jump = frame(0.8);
  expect(smoothHand(previous, jump, 16)).toBe(jump);
  const missing = { ...frame(0.1), hand_detected: false, landmarks: [], tip: null };
  expect(smoothHand(previous, missing, 16)).toBe(missing);
  const rotated = { ...frame(0.15), resolution: { width: 360, height: 640 } };
  expect(smoothHand(previous, rotated, 16)).toBe(rotated);
});
