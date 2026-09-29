import { expect, test } from "@playwright/test";
import { EMPTY_LASER_TRACK, advanceLaser, laserHint, type LaserPoint, type LaserTrack } from "../src/utils/laserTrack";

const LONG_SIDE = 1280; // khung laser gửi lên: cạnh dài 1280 → "cùng chấm" trong 80 px

const run = (points: (LaserPoint | null)[], start: LaserTrack = EMPTY_LASER_TRACK) => {
  let track = start;
  return points.map((raw) => {
    const step = advanceLaser(track, raw, LONG_SIDE);
    track = step.track;
    return step;
  });
};

test("the first dot is shown immediately", () => {
  const [first] = run([[600, 300]]);
  expect(first.accepted).toBe(true);
  expect(first.track.point).toEqual([600, 300]);
});

test("a one-frame jump to a look-alike is ignored and the dot stays put", () => {
  const steps = run([[600, 300], [602, 301], [100, 700], [603, 302]]);
  const jump = steps[2];
  expect(jump.accepted).toBe(false);
  expect(jump.track.point).toEqual(steps[1].track.point);
  expect(steps[3].accepted).toBe(true);
  expect(steps[3].track.point![0]).toBeGreaterThan(600);
});

test("a real move to a new place is followed after it repeats", () => {
  const steps = run([[600, 300], [600, 300], [100, 700], [104, 702]]);
  expect(steps[2].accepted).toBe(false);
  expect(steps[3].accepted).toBe(true);
  expect(steps[3].track.point).toEqual([104, 702]);
});

test("short dropouts keep the dot, long ones clear it", () => {
  const steps = run([[600, 300], [600, 300], null, null, null, null]);
  expect(steps.slice(2, 5).map((s) => s.track.point)).toEqual([[600, 300], [600, 300], [600, 300]]);
  expect(steps.every((s, i) => i < 2 || !s.accepted)).toBe(true);
  expect(steps[5].track.point).toBeNull();
});

test("small hand shake is smoothed and the hint is whole pixels", () => {
  const steps = run([[600, 300], [605, 300]]);
  const x = steps[1].track.point![0];
  expect(x).toBeGreaterThan(600);
  expect(x).toBeLessThan(605);
  expect(laserHint(steps[1].track)).toEqual([Math.round(x), 300]);
  expect(laserHint(EMPTY_LASER_TRACK)).toBeNull();
});

test("a real move within the gate is followed without lag", () => {
  const steps = run([[600, 300], [640, 320]]);
  expect(steps[1].accepted).toBe(true);
  expect(steps[1].track.point).toEqual([640, 320]);
});
