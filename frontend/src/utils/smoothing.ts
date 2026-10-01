import type { FrameResult } from "@/common/types";

/** Share of the frame beyond which a move (hand reacquired, laser tracking accepted a far spot) is drawn at once. */
const SNAP = 0.2;

/**
 * Glide the hand and the laser dot between server results at display refresh rate.
 * Smooth only display coordinates; server results used for selection/history stay untouched.
 */
export const smoothPointer = (previous: FrameResult | null, target: FrameResult, elapsedMs: number): FrameResult => {
  if (!previous || previous.resolution.width !== target.resolution.width ||
      previous.resolution.height !== target.resolution.height) return target;
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 24);
  const toward = (from: number, to: number) => from + (to - from) * alpha;
  let displayed = target;
  const wrist = target.landmarks[0];
  const oldWrist = previous.landmarks[0];
  // Reacquisition/large jumps should snap immediately instead of dragging a phantom hand.
  if (target.landmarks.length === 21 && previous.landmarks.length === 21 &&
      Math.hypot(wrist.x - oldWrist.x, wrist.y - oldWrist.y) <= SNAP) {
    displayed = {
      ...displayed,
      landmarks: target.landmarks.map((point, i) => ({
        x: toward(previous.landmarks[i].x, point.x),
        y: toward(previous.landmarks[i].y, point.y),
      })),
      tip: target.tip && previous.tip
        ? [toward(previous.tip[0], target.tip[0]), toward(previous.tip[1], target.tip[1])]
        : target.tip,
    };
  }
  const dot = target.laser?.point;
  const oldDot = previous.laser?.point;
  if (target.laser && dot && oldDot &&
      Math.hypot((dot[0] - oldDot[0]) / target.resolution.width, (dot[1] - oldDot[1]) / target.resolution.height) <= SNAP) {
    displayed = { ...displayed, laser: { ...target.laser, point: [toward(oldDot[0], dot[0]), toward(oldDot[1], dot[1])] } };
  }
  return displayed;
};
